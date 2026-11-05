<?php
namespace Pizzalog\Services;

use Pizzalog\Core\Config;

class Mailer
{
    /**
     * Envía un email en formato HTML con versión alternativa en texto plano.
     */
    public static function send(string $toEmail, string $subject, string $htmlBody, ?string $textBody = null): bool
    {
        $smtp = Config::get('smtp', []);
        $host = trim((string) ($smtp['host'] ?? ''));
        $port = (int) ($smtp['port'] ?? 465);
        $user = trim((string) ($smtp['username'] ?? ($smtp['user'] ?? '')));
        $pass = (string) ($smtp['password'] ?? ($smtp['pass'] ?? ''));
        $fromEmail = trim((string) ($smtp['from_email'] ?? 'no-reply@pizzalog.net'));
        $fromName = trim((string) ($smtp['from_name'] ?? 'Pizzalog Tools'));

        if ($textBody === null) {
            $textBody = strip_tags(str_replace(['<br>', '<br/>', '<br />', '</p>'], "\n", $htmlBody));
        }

        // Si hay servidor SMTP configurado, intentamos conexión directa por socket
        if ($host !== '' && $user !== '') {
            $ok = self::sendSmtp($host, $port, $user, $pass, $fromEmail, $fromName, $toEmail, $subject, $htmlBody, $textBody);
            if ($ok) return true;
            error_log('[pizzalog-mailer] SMTP socket delivery failed, trying mail() fallback...');
        }

        // Fallback a mail() de PHP
        return self::sendMailFunction($fromEmail, $fromName, $toEmail, $subject, $htmlBody, $textBody);
    }

    /**
     * Envía email de bienvenida y activación para Pizzalog Tools post-pago.
     */
    public static function sendToolsActivation(string $toEmail, string $name, string $activationLink, string $planName = 'Mensual'): bool
    {
        $subject = '¡Bienvenido a Pizzalog Tools! Activá tu cuenta';
        $safeName = htmlspecialchars($name ?: 'Amigo gastronómico', ENT_QUOTES, 'UTF-8');
        $safeLink = htmlspecialchars($activationLink, ENT_QUOTES, 'UTF-8');
        $safePlan = htmlspecialchars($planName, ENT_QUOTES, 'UTF-8');

        $html = <<<HTML
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Activá tu cuenta de Pizzalog Tools</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f9fa; margin: 0; padding: 24px; color: #1a202c; }
    .card { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 10px; border: 1px solid #e2e8f0; padding: 36px 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.03); }
    .logo { font-size: 24px; font-weight: 800; color: #d9381e; margin-bottom: 24px; }
    h1 { font-size: 20px; font-weight: 700; margin: 0 0 16px 0; color: #2d3748; }
    p { font-size: 15px; line-height: 1.6; color: #4a5568; margin: 0 0 16px 0; }
    .badge { display: inline-block; background: #edf2f7; color: #4a5568; font-size: 13px; font-weight: 600; padding: 4px 10px; border-radius: 6px; margin-bottom: 20px; }
    .btn-container { text-align: center; margin: 30px 0; }
    .btn { display: inline-block; background-color: #d9381e; color: #ffffff !important; text-decoration: none; font-size: 16px; font-weight: 700; padding: 14px 28px; border-radius: 8px; }
    .footer { font-size: 12px; color: #a0aec0; margin-top: 32px; border-top: 1px solid #edf2f7; padding-top: 16px; line-height: 1.5; }
    .link-alt { word-break: break-all; font-size: 13px; color: #3182ce; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🍕 Pizzalog Tools</div>
    <h1>¡Hola, {$safeName}!</h1>
    <div class="badge">Suscripción activa: Plan {$safePlan}</div>
    <p>Gracias por suscribirte a <strong>Pizzalog Tools</strong>. Tu cuenta ya está lista para que ingreses y comiences a calcular costos precisos, perfiles de masa, ingeniería de menú y fijación de precios.</p>
    <p>Hacé clic en el siguiente botón para crear tu contraseña de acceso:</p>
    <div class="btn-container">
      <a href="{$safeLink}" class="btn" target="_blank">Activar mi cuenta y crear contraseña</a>
    </div>
    <p>O copiá y pegá este enlace en tu navegador:</p>
    <p><a href="{$safeLink}" class="link-alt">{$safeLink}</a></p>
    <div class="footer">
      Este enlace de activación tiene una vigencia de 7 días.<br>
      Si no realizaste esta compra, por favor desestimá este mensaje o contactanos en soporte@pizzalog.net.
    </div>
  </div>
</body>
</html>
HTML;

        return self::send($toEmail, $subject, $html);
    }

    /**
     * Envía email de restablecimiento de contraseña.
     */
    public static function sendPasswordReset(string $toEmail, string $name, string $resetLink): bool
    {
        $subject = 'Restablecé tu contraseña de Pizzalog Tools';
        $safeName = htmlspecialchars($name ?: 'Usuario', ENT_QUOTES, 'UTF-8');
        $safeLink = htmlspecialchars($resetLink, ENT_QUOTES, 'UTF-8');

        $html = <<<HTML
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Restablecer contraseña</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f9fa; margin: 0; padding: 24px; color: #1a202c; }
    .card { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 10px; border: 1px solid #e2e8f0; padding: 36px 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.03); }
    .logo { font-size: 24px; font-weight: 800; color: #d9381e; margin-bottom: 24px; }
    h1 { font-size: 20px; font-weight: 700; margin: 0 0 16px 0; color: #2d3748; }
    p { font-size: 15px; line-height: 1.6; color: #4a5568; margin: 0 0 16px 0; }
    .btn-container { text-align: center; margin: 30px 0; }
    .btn { display: inline-block; background-color: #d9381e; color: #ffffff !important; text-decoration: none; font-size: 16px; font-weight: 700; padding: 14px 28px; border-radius: 8px; }
    .footer { font-size: 12px; color: #a0aec0; margin-top: 32px; border-top: 1px solid #edf2f7; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🍕 Pizzalog Tools</div>
    <h1>Hola, {$safeName}</h1>
    <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en Pizzalog Tools.</p>
    <div class="btn-container">
      <a href="{$safeLink}" class="btn" target="_blank">Cambiar mi contraseña</a>
    </div>
    <p>Este enlace vence en 2 horas. Si no solicitaste este cambio, podés ignorar este correo sin problemas.</p>
    <div class="footer">
      Pizzalog Tools · Sistema gastronómico
    </div>
  </div>
</body>
</html>
HTML;

        return self::send($toEmail, $subject, $html);
    }

    private static function sendSmtp(
        string $host,
        int $port,
        string $user,
        string $pass,
        string $fromEmail,
        string $fromName,
        string $toEmail,
        string $subject,
        string $htmlBody,
        string $textBody
    ): bool {
        $protocol = ($port === 465) ? 'ssl://' : '';
        $timeout = 10;
        $socket = @fsockopen($protocol . $host, $port, $errno, $errstr, $timeout);
        if (!$socket) {
            error_log("[pizzalog-mailer] fsockopen failed to {$host}:{$port} ($errno: $errstr)");
            return false;
        }

        $read = static function () use ($socket): string {
            $response = '';
            while ($line = fgets($socket, 515)) {
                $response .= $line;
                if (isset($line[3]) && $line[3] === ' ') break;
            }
            return $response;
        };

        $write = static function (string $cmd) use ($socket): void {
            fputs($socket, $cmd . "\r\n");
        };

        $init = $read();
        if (!str_starts_with($init, '220')) {
            fclose($socket);
            return false;
        }

        $write('EHLO ' . gethostname());
        $ehlo = $read();

        if ($port === 587) {
            $write('STARTTLS');
            $tls = $read();
            if (str_starts_with($tls, '220')) {
                stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT);
                $write('EHLO ' . gethostname());
                $read();
            }
        }

        $write('AUTH LOGIN');
        $read();
        $write(base64_encode($user));
        $read();
        $write(base64_encode($pass));
        $authRes = $read();
        if (!str_starts_with($authRes, '235')) {
            error_log('[pizzalog-mailer] SMTP Auth failed: ' . trim($authRes));
            fclose($socket);
            return false;
        }

        $write('MAIL FROM: <' . $fromEmail . '>');
        $read();
        $write('RCPT TO: <' . $toEmail . '>');
        $read();
        $write('DATA');
        $read();

        $boundary = 'bnd_' . md5((string) microtime(true));
        $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
        $encodedFromName = '=?UTF-8?B?' . base64_encode($fromName) . '?=';

        $headers = [
            "From: {$encodedFromName} <{$fromEmail}>",
            "To: <{$toEmail}>",
            "Subject: {$encodedSubject}",
            "MIME-Version: 1.0",
            "Content-Type: multipart/alternative; boundary=\"{$boundary}\"",
            "Date: " . date('r'),
        ];

        $message = implode("\r\n", $headers) . "\r\n\r\n";
        $message .= "--{$boundary}\r\n";
        $message .= "Content-Type: text/plain; charset=UTF-8\r\n";
        $message .= "Content-Transfer-Encoding: base64\r\n\r\n";
        $message .= chunk_split(base64_encode($textBody)) . "\r\n";
        $message .= "--{$boundary}\r\n";
        $message .= "Content-Type: text/html; charset=UTF-8\r\n";
        $message .= "Content-Transfer-Encoding: base64\r\n\r\n";
        $message .= chunk_split(base64_encode($htmlBody)) . "\r\n";
        $message .= "--{$boundary}--\r\n.";

        $write($message);
        $dataRes = $read();
        $write('QUIT');
        fclose($socket);

        return str_starts_with($dataRes, '250');
    }

    private static function sendMailFunction(
        string $fromEmail,
        string $fromName,
        string $toEmail,
        string $subject,
        string $htmlBody,
        string $textBody
    ): bool {
        $boundary = 'bnd_' . md5((string) microtime(true));
        $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
        $encodedFromName = '=?UTF-8?B?' . base64_encode($fromName) . '?=';

        $headers = [
            "From: {$encodedFromName} <{$fromEmail}>",
            "Reply-To: {$fromEmail}",
            "MIME-Version: 1.0",
            "Content-Type: multipart/alternative; boundary=\"{$boundary}\"",
        ];

        $message = "--{$boundary}\r\n";
        $message .= "Content-Type: text/plain; charset=UTF-8\r\n";
        $message .= "Content-Transfer-Encoding: base64\r\n\r\n";
        $message .= chunk_split(base64_encode($textBody)) . "\r\n";
        $message .= "--{$boundary}\r\n";
        $message .= "Content-Type: text/html; charset=UTF-8\r\n";
        $message .= "Content-Transfer-Encoding: base64\r\n\r\n";
        $message .= chunk_split(base64_encode($htmlBody)) . "\r\n";
        $message .= "--{$boundary}--\r\n";

        return @mail($toEmail, $encodedSubject, $message, implode("\r\n", $headers));
    }
}
