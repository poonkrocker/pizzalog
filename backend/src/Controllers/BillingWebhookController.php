<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Config;
use Pizzalog\Core\Database;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;
use Pizzalog\Services\Mailer;

class BillingWebhookController
{
    private static bool $tablesReady = false;

    public function __construct()
    {
        self::ensureTables();
    }

    public static function ensureTables(): void
    {
        if (self::$tablesReady) return;
        $pdo = Database::pdo();
        $pdo->exec("CREATE TABLE IF NOT EXISTS tools_subscriptions (
            id                       BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            tools_account_id         BIGINT UNSIGNED NOT NULL,
            provider                 VARCHAR(32) NOT NULL,
            provider_customer_id     VARCHAR(128) NULL,
            provider_subscription_id VARCHAR(128) NULL,
            plan                     VARCHAR(32) NOT NULL,
            status                   VARCHAR(32) NOT NULL DEFAULT 'active',
            current_period_end       DATETIME NULL,
            raw_last_event           MEDIUMTEXT NULL,
            created_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_provider_sub (provider, provider_subscription_id),
            KEY idx_ts_account (tools_account_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        $pdo->exec("CREATE TABLE IF NOT EXISTS billing_webhook_events (
            id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            provider     VARCHAR(32) NOT NULL,
            event_id     VARCHAR(128) NOT NULL,
            event_type   VARCHAR(64) NOT NULL,
            payload      MEDIUMTEXT NULL,
            processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_provider_event (provider, event_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        // Asegurar columnas de activación en tools_accounts de forma segura
        try {
            $cols = $pdo->query("SHOW COLUMNS FROM tools_accounts LIKE 'activation_token'")->fetchAll();
            if (empty($cols)) {
                $pdo->exec("ALTER TABLE tools_accounts
                    ADD COLUMN activation_token VARCHAR(96) NULL AFTER password_hash,
                    ADD COLUMN activation_token_expires_at DATETIME NULL AFTER activation_token,
                    ADD KEY idx_ta_activation (activation_token)");
            }
        } catch (\Throwable $e) {
            // Ignorar si ya existe
        }
        self::$tablesReady = true;
    }

    /**
     * POST /billing/webhook/lemonsqueezy
     * Procesa altas, renovaciones y cancelaciones internacionales vía LemonSqueezy.
     */
    public function lemonSqueezy(Request $req): void
    {
        $rawBody = (string) file_get_contents('php://input');
        $secret = (string) (Config::get('lemonsqueezy', [])['webhook_secret'] ?? '');

        // Validación de firma HMAC si está configurada
        $signature = (string) ($_SERVER['HTTP_X_SIGNATURE'] ?? '');
        if ($secret !== '') {
            $computed = hash_hmac('sha256', $rawBody, $secret);
            if (!hash_equals($computed, $signature)) {
                Response::error('Firma de webhook inválida', 401);
            }
        }

        $payload = json_decode($rawBody, true);
        if (!is_array($payload)) {
            Response::error('Cuerpo de webhook inválido', 400);
        }

        $eventName = (string) ($payload['meta']['event_name'] ?? '');
        $data = $payload['data'] ?? [];
        $eventId = (string) ($payload['meta']['custom_data']['event_id'] ?? ($data['id'] ?? md5($rawBody)));

        if ($this->isEventAlreadyProcessed('lemonsqueezy', $eventId)) {
            Response::ok(['status' => 'already_processed']);
        }

        $attributes = $data['attributes'] ?? [];
        $email = strtolower(trim((string) ($attributes['user_email'] ?? '')));
        $name = trim((string) ($attributes['user_name'] ?? 'Cliente Pizzalog'));
        $subId = (string) ($data['id'] ?? '');
        $customerId = (string) ($attributes['customer_id'] ?? '');
        $statusRaw = (string) ($attributes['status'] ?? 'active');

        // Determinar plan (mensual / anual)
        $productName = strtolower((string) ($attributes['first_subscription_item']['product_name'] ?? ($attributes['order_item']['product_name'] ?? '')));
        $variantName = strtolower((string) ($attributes['first_subscription_item']['variant_name'] ?? ($attributes['order_item']['variant_name'] ?? '')));
        $plan = (str_contains($productName, 'anual') || str_contains($variantName, 'anual') || str_contains($variantName, 'year'))
            ? 'yearly'
            : 'monthly';

        $renewsAt = $attributes['renews_at'] ?? ($attributes['ends_at'] ?? null);
        $periodEnd = $renewsAt ? date('Y-m-d H:i:s', strtotime((string) $renewsAt)) : null;
        if (!$periodEnd) {
            $periodEnd = $plan === 'yearly'
                ? date('Y-m-d H:i:s', strtotime('+1 year +3 days'))
                : date('Y-m-d H:i:s', strtotime('+1 month +3 days'));
        }

        $status = match ($statusRaw) {
            'active', 'on_trial' => 'active',
            'past_due', 'unpaid' => 'past_due',
            'cancelled', 'expired' => 'cancelled',
            default => 'active',
        };

        if ($email !== '' && in_array($eventName, ['subscription_created', 'subscription_payment_success', 'order_created', 'subscription_updated'], true)) {
            $this->provisionOrRenewToolsAccount([
                'provider' => 'lemonsqueezy',
                'provider_subscription_id' => $subId,
                'provider_customer_id' => $customerId,
                'email' => $email,
                'name' => $name,
                'plan' => $plan,
                'status' => $status,
                'period_end' => $periodEnd,
                'raw_event' => $rawBody,
            ]);
        } elseif ($email !== '' && in_array($eventName, ['subscription_cancelled', 'subscription_expired'], true)) {
            $this->updateSubscriptionStatus('lemonsqueezy', $subId, 'cancelled', $rawBody);
        }

        $this->recordEvent('lemonsqueezy', $eventId, $eventName, $rawBody);
        Response::ok(['status' => 'processed']);
    }

    /**
     * POST /billing/webhook/mercadopago
     * Procesa altas, suscripciones (preapproval) y pagos de Mercado Pago para Argentina / Latam.
     */
    public function mercadoPago(Request $req): void
    {
        $rawBody = (string) file_get_contents('php://input');
        $payload = json_decode($rawBody, true) ?: [];

        $type = (string) ($payload['type'] ?? ($payload['topic'] ?? ($req->query['type'] ?? ($req->query['topic'] ?? ''))));
        $dataId = (string) ($payload['data']['id'] ?? ($req->query['data.id'] ?? ($req->query['id'] ?? '')));
        $eventId = 'mp_' . ($dataId ?: md5($rawBody . microtime(true)));

        if ($dataId !== '' && $this->isEventAlreadyProcessed('mercadopago', $eventId)) {
            Response::ok(['status' => 'already_processed']);
        }

        $mpConfig = Config::get('mercadopago', []);
        $accessToken = trim((string) ($mpConfig['access_token'] ?? ''));

        $email = '';
        $name = 'Cliente Pizzalog';
        $subId = $dataId;
        $customerId = null;
        $status = 'active';
        $plan = 'monthly';
        $periodEnd = date('Y-m-d H:i:s', strtotime('+1 month +3 days'));

        // Si tenemos datos en el body directamente (ej. simulación o preapproval payload)
        if (!empty($payload['payer_email']) || !empty($payload['payer']['email'])) {
            $email = strtolower(trim((string) ($payload['payer_email'] ?? $payload['payer']['email'])));
            $name = trim((string) ($payload['payer']['name'] ?? ($payload['payer_name'] ?? 'Cliente Pizzalog')));
            $plan = (isset($payload['plan']) && $payload['plan'] === 'yearly') ? 'yearly' : 'monthly';
        } elseif ($accessToken !== '' && $dataId !== '') {
            // Consultar a la API de Mercado Pago
            $endpoint = ($type === 'subscription_preapproval' || $type === 'preapproval')
                ? "https://api.mercadopago.com/preapproval/{$dataId}"
                : "https://api.mercadopago.com/v1/payments/{$dataId}";

            $ch = curl_init($endpoint);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HTTPHEADER => [
                    "Authorization: Bearer {$accessToken}",
                    "Content-Type: application/json",
                ],
                CURLOPT_TIMEOUT => 15,
            ]);
            $resRaw = curl_exec($ch);
            $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($resRaw && $httpCode >= 200 && $httpCode < 300) {
                $mpData = json_decode($resRaw, true);
                if (is_array($mpData)) {
                    $email = strtolower(trim((string) ($mpData['payer_email'] ?? ($mpData['payer']['email'] ?? ''))));
                    $name = trim((string) ($mpData['payer']['first_name'] ?? ($mpData['payer']['name'] ?? 'Cliente Pizzalog')));
                    $reason = strtolower((string) ($mpData['reason'] ?? ($mpData['description'] ?? '')));
                    if (str_contains($reason, 'anual') || str_contains($reason, 'year')) {
                        $plan = 'yearly';
                        $periodEnd = date('Y-m-d H:i:s', strtotime('+1 year +3 days'));
                    }
                    $mpStatus = (string) ($mpData['status'] ?? 'authorized');
                    $status = in_array($mpStatus, ['authorized', 'approved', 'active'], true) ? 'active' : 'past_due';
                    if (!empty($mpData['next_payment_date'])) {
                        $periodEnd = date('Y-m-d H:i:s', strtotime((string) $mpData['next_payment_date'] . ' +3 days'));
                    }
                }
            }
        }

        if ($email !== '' && $status === 'active') {
            $this->provisionOrRenewToolsAccount([
                'provider' => 'mercadopago',
                'provider_subscription_id' => $subId ?: ('mp_' . time()),
                'provider_customer_id' => $customerId,
                'email' => $email,
                'name' => $name,
                'plan' => $plan,
                'status' => $status,
                'period_end' => $periodEnd,
                'raw_event' => $rawBody,
            ]);
        }

        $this->recordEvent('mercadopago', $eventId, $type ?: 'notification', $rawBody);
        Response::ok(['status' => 'processed']);
    }

    private function provisionOrRenewToolsAccount(array $d): void
    {
        $pdo = Database::pdo();
        $email = strtolower(trim($d['email']));
        $name = trim($d['name']) ?: 'Usuario Pizzalog';
        $environment = 'production';
        $periodEnd = $d['period_end'];

        // Buscar si ya existe la cuenta
        $check = $pdo->prepare('SELECT id, is_active, password_hash, expires_at FROM tools_accounts WHERE email = ? AND environment = ? LIMIT 1');
        $check->execute([$email, $environment]);
        $existing = $check->fetch(\PDO::FETCH_ASSOC);

        $isNew = false;
        $accountId = 0;
        $activationToken = null;

        if (!$existing) {
            $isNew = true;
            $activationToken = bin2hex(random_bytes(32));
            $tokenExpiresAt = date('Y-m-d H:i:s', strtotime('+7 days'));

            $insert = $pdo->prepare(
                'INSERT INTO tools_accounts (email, environment, name, password_hash, activation_token, activation_token_expires_at, is_active, expires_at)
                 VALUES (?, ?, ?, NULL, ?, ?, 1, ?)'
            );
            $insert->execute([$email, $environment, $name, $activationToken, $tokenExpiresAt, $periodEnd]);
            $accountId = (int) $pdo->lastInsertId();
        } else {
            $accountId = (int) $existing['id'];
            // Extender vencimiento y asegurar estado activo
            $pdo->prepare('UPDATE tools_accounts SET is_active = 1, expires_at = ? WHERE id = ?')->execute([$periodEnd, $accountId]);

            // Si nunca definió contraseña, regeneramos token de activación
            if (empty($existing['password_hash'])) {
                $activationToken = bin2hex(random_bytes(32));
                $tokenExpiresAt = date('Y-m-d H:i:s', strtotime('+7 days'));
                $pdo->prepare('UPDATE tools_accounts SET activation_token = ?, activation_token_expires_at = ? WHERE id = ?')
                    ->execute([$activationToken, $tokenExpiresAt, $accountId]);
            }
        }

        // Registrar o actualizar suscripción
        $subStmt = $pdo->prepare(
            'INSERT INTO tools_subscriptions
                (tools_account_id, provider, provider_customer_id, provider_subscription_id, plan, status, current_period_end, raw_last_event)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                status = VALUES(status),
                current_period_end = VALUES(current_period_end),
                raw_last_event = VALUES(raw_last_event)'
        );
        $subStmt->execute([
            $accountId,
            $d['provider'],
            $d['provider_customer_id'],
            $d['provider_subscription_id'],
            $d['plan'],
            $d['status'],
            $periodEnd,
            $d['raw_event'],
        ]);

        // Si es cuenta nueva o no tenía contraseña, enviar email con link de activación
        if ($activationToken !== null) {
            $toolsBaseUrl = trim((string) (Config::get('tools', [])['url'] ?? 'https://tools.pizzalog.net'), '/');
            $activationLink = "{$toolsBaseUrl}/?activate={$activationToken}";
            $planLabel = $d['plan'] === 'yearly' ? 'Anual' : 'Mensual';
            Mailer::sendToolsActivation($email, $name, $activationLink, $planLabel);
        }
    }

    private function updateSubscriptionStatus(string $provider, string $subId, string $status, string $rawEvent): void
    {
        if ($subId === '') return;
        $pdo = Database::pdo();
        $pdo->prepare(
            'UPDATE tools_subscriptions
                SET status = ?, raw_last_event = ?
              WHERE provider = ? AND provider_subscription_id = ?'
        )->execute([$status, $rawEvent, $provider, $subId]);
    }

    private function isEventAlreadyProcessed(string $provider, string $eventId): bool
    {
        $pdo = Database::pdo();
        $stmt = $pdo->prepare('SELECT id FROM billing_webhook_events WHERE provider = ? AND event_id = ? LIMIT 1');
        $stmt->execute([$provider, $eventId]);
        return (bool) $stmt->fetchColumn();
    }

    private function recordEvent(string $provider, string $eventId, string $eventType, string $payload): void
    {
        $pdo = Database::pdo();
        $pdo->prepare(
            'INSERT IGNORE INTO billing_webhook_events (provider, event_id, event_type, payload)
             VALUES (?, ?, ?, ?)'
        )->execute([$provider, $eventId, $eventType, $payload]);
    }
}
