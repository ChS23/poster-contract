# Poster DApp

Poster DApp - это децентрализованное приложение, построенное на тестовой сети Polygon Amoy, которое позволяет пользователям создавать и просматривать посты с тегами. Этот README предоставляет краткое руководство по использованию приложения.

## Функции

1. **Создание постов**: Пользователи могут публиковать текстовые сообщения в блокчейне, используя функцию контракта `post`.
2. **Просмотр постов**: Любой может просматривать текст, тег и адрес пользователя для всех постов, сохраненных в контракте.
3. **Фильтрация постов**: Пользователи могут фильтровать посты по тегам для поиска конкретного контента.

## Начало работы

### Предварительные требования

- Установленное расширение браузера MetaMask
- Некоторое количество POL (токены тестовой сети Polygon Amoy) в вашем кошельке

### Подключение кошелька

1. Нажмите кнопку "Connect Wallet" в правом верхнем углу приложения.
2. Подтвердите запрос на подключение в MetaMask.
3. Если будет предложено, переключитесь на тестовую сеть Polygon Amoy.

## Использование DApp

### Создание поста

1. В разделе "Create a Post" введите ваше сообщение в текстовое поле.
2. Добавьте тег для вашего поста (только буквы и цифры, максимум 20 символов).
3. Нажмите кнопку "Post", чтобы отправить ваше сообщение в блокчейн.

### Просмотр постов

- Все посты отображаются в разделе "Search Posts".
- Каждый пост показывает адрес пользователя (сокращенный), содержание и тег.

### Поиск постов

1. Введите тег в поле поиска под "Search Posts".
2. Нажмите кнопку "Search", чтобы отфильтровать посты по введенному тегу.
3. Приложение отобразит все посты, соответствующие указанному тегу.

## Технические детали

- DApp построено с использованием React и Web3.js.
- Оно взаимодействует со смарт-контрактом, развернутым в тестовой сети Polygon Amoy.
- Посты хранятся в блокчейне, обеспечивая прозрачность и неизменность.