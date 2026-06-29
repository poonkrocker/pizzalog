<?php
namespace Pizzalog\Core;

/**
 * Router minimalista. Soporta parámetros de ruta tipo /products/{id}
 * y una pila de middlewares por ruta.
 */
class Router
{
    private array $routes = [];

    public function add(string $method, string $path, array|callable $handler, array $middleware = []): void
    {
        $this->routes[] = [
            'method'     => strtoupper($method),
            'pattern'    => $this->compile($path),
            'handler'    => $handler,
            'middleware' => $middleware,
        ];
    }

    public function get(string $p, array|callable $h, array $m = []): void    { $this->add('GET', $p, $h, $m); }
    public function post(string $p, array|callable $h, array $m = []): void   { $this->add('POST', $p, $h, $m); }
    public function put(string $p, array|callable $h, array $m = []): void    { $this->add('PUT', $p, $h, $m); }
    public function delete(string $p, array|callable $h, array $m = []): void { $this->add('DELETE', $p, $h, $m); }

    private function compile(string $path): string
    {
        // /products/{id} -> #^/products/(?P<id>[^/]+)$#
        $regex = preg_replace('#\{([a-zA-Z_][a-zA-Z0-9_]*)\}#', '(?P<$1>[^/]+)', $path);
        return '#^' . $regex . '$#';
    }

    public function dispatch(Request $req): void
    {
        foreach ($this->routes as $route) {
            if ($route['method'] !== $req->method) {
                continue;
            }
            if (!preg_match($route['pattern'], $req->path, $matches)) {
                continue;
            }

            // Solo los grupos nombrados (parámetros de ruta).
            $req->params = array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY);

            // Cada middleware valida o corta con Response::error(...).
            foreach ($route['middleware'] as $mw) {
                $mw($req);
            }

            $handler = $route['handler'];
            if (is_array($handler)) {
                [$class, $action] = $handler;
                (new $class())->$action($req);
            } else {
                $handler($req);
            }
            return;
        }

        Response::error('Ruta no encontrada', 404);
    }
}
