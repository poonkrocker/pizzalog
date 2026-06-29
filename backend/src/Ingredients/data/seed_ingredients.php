<?php
/**
 * Diccionario base de ingredientes de pizzería argentina.
 * Sirve para que el extractor reconozca ingredientes desde el día uno,
 * incluso antes de que el negocio haya cargado los suyos.
 *
 * El catálogo real del negocio (tabla `ingredients`) se suma a este seed
 * y lo va mejorando con el uso. Editá/ampliá esta lista libremente.
 *
 * Estructura: name (canónico, como se muestra) · category · aliases.
 * El matching ignora mayúsculas y acentos, así que los alias pueden ir
 * sin acento sin problema.
 */

return [
    // --- Masa / base ---
    ['name' => 'Masa madre',        'category' => 'masa',       'aliases' => []],

    // --- Salsas ---
    ['name' => 'Salsa de tomate',   'category' => 'salsa',      'aliases' => ['salsa', 'tomate triturado', 'pure de tomate']],
    ['name' => 'Pesto',             'category' => 'salsa',      'aliases' => []],

    // --- Quesos ---
    ['name' => 'Muzzarella',        'category' => 'queso',      'aliases' => ['muzza', 'mozzarella', 'mozarella', 'mozzarela']],
    ['name' => 'Provolone',         'category' => 'queso',      'aliases' => ['provoleta']],
    ['name' => 'Roquefort',         'category' => 'queso',      'aliases' => ['roquefor']],
    ['name' => 'Parmesano',         'category' => 'queso',      'aliases' => ['queso rallado', 'parmesano rallado']],
    ['name' => 'Gorgonzola',        'category' => 'queso',      'aliases' => []],
    ['name' => 'Cheddar',           'category' => 'queso',      'aliases' => []],
    ['name' => 'Fontina',           'category' => 'queso',      'aliases' => []],
    ['name' => 'Queso azul',        'category' => 'queso',      'aliases' => []],

    // --- Fiambres ---
    ['name' => 'Jamón cocido',      'category' => 'fiambre',    'aliases' => ['jamon']],
    ['name' => 'Jamón crudo',       'category' => 'fiambre',    'aliases' => ['crudo']],
    ['name' => 'Panceta',           'category' => 'fiambre',    'aliases' => ['bacon', 'tocino']],
    ['name' => 'Salame',            'category' => 'fiambre',    'aliases' => ['salamin']],
    ['name' => 'Bondiola',          'category' => 'fiambre',    'aliases' => []],
    ['name' => 'Anchoas',           'category' => 'fiambre',    'aliases' => ['anchoa', 'boquerones']],

    // --- Vegetales ---
    ['name' => 'Tomate',            'category' => 'vegetal',    'aliases' => ['tomate en rodajas', 'tomate fresco']],
    ['name' => 'Cebolla',           'category' => 'vegetal',    'aliases' => ['cebolla caramelizada', 'cebolla morada']],
    ['name' => 'Morrón',            'category' => 'vegetal',    'aliases' => ['pimiento', 'aji', 'morron asado']],
    ['name' => 'Aceitunas',         'category' => 'vegetal',    'aliases' => ['aceituna', 'aceitunas verdes', 'aceitunas negras']],
    ['name' => 'Rúcula',            'category' => 'vegetal',    'aliases' => []],
    ['name' => 'Champiñones',       'category' => 'vegetal',    'aliases' => ['champinones', 'champignones', 'champignon', 'hongos', 'portobello']],
    ['name' => 'Choclo',            'category' => 'vegetal',    'aliases' => ['maiz']],
    ['name' => 'Palmitos',          'category' => 'vegetal',    'aliases' => ['palmito']],
    ['name' => 'Espinaca',          'category' => 'vegetal',    'aliases' => []],
    ['name' => 'Berenjena',         'category' => 'vegetal',    'aliases' => ['berenjenas']],
    ['name' => 'Zucchini',          'category' => 'vegetal',    'aliases' => ['zapallito', 'calabacin']],
    ['name' => 'Radicheta',         'category' => 'vegetal',    'aliases' => ['radicha']],
    ['name' => 'Ajo',               'category' => 'vegetal',    'aliases' => []],

    // --- Frutas ---
    ['name' => 'Ananá',             'category' => 'fruta',      'aliases' => ['anana', 'piña', 'pina']],

    // --- Condimentos / hierbas ---
    ['name' => 'Albahaca',          'category' => 'condimento', 'aliases' => ['albahaca fresca']],
    ['name' => 'Orégano',           'category' => 'condimento', 'aliases' => ['oregano']],
    ['name' => 'Ají molido',        'category' => 'condimento', 'aliases' => ['aji molido', 'aji picante']],
    ['name' => 'Aceite de oliva',   'category' => 'condimento', 'aliases' => ['oliva']],
    ['name' => 'Tomillo',           'category' => 'condimento', 'aliases' => []],

    // --- Otros ---
    ['name' => 'Huevo',             'category' => 'otro',       'aliases' => ['huevo frito', 'huevo duro']],
];
