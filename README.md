# Пример торогового робота на NodeJS с использованием Tinkoff Invest Api v2

Робот разрабатывался с целью максимально просто интегрировать новые стратегии основанные на различных индикаторах технического анализа.

Всего есть 3 основные сущности:

```ts
class CandlesRobot {
  start(options): void;
  stop(): void;
}
```

CandlesRobot - это робот который может следить свечами какого-либо инструмента, и в зависимости от переданной ему стратегии, "генерировать" сигналы. На самом деле при вызове метода `candlesRobot.start()`, в него передается параметр `signalReceiver` который будет получать сигналы и делать с ними что ему угодно (здесь я отталкивался от своего минимального опыта взаимодействия с metatrader, где также есть возможность создания торговых роботов, которые могли по усмотрению пользователя, либо уведомлять его звуком, когда получали сигнал к покупке или продаже, либо торговать самостоятельно).

```ts
interface ICandlesRobotSignalReceiver {
  receive(signal: CandlesRobotSignal): void;
}
```

<div id="signalReceiver">Конкретно в моем проекте `signalReceiver` выставляет заявки на биржу, и фиксирует прибыль или убыток, исходя из изначально заданных параметров</div>

| Parameter | Description |
| --- | ------ |
| `accountId`          | идентификатор аккаунта с которого будут выставляться заявки |
| `lotsPerBet`         | Количество лотов, которые будут куплены при получении сигнала |
| `maxConcurrentBets`  | Максимальное количественно одновременно открытых сигналов (Сигнал счиатется открытым, пока по нему не будут выполнены TP или SL) |
| `takeProfitPercent`  | Процент TP, то есть величина TP будет рассчитываться по формуле `instrumentPrice * (1 + takeProfitPercent)`. Указывается в формате: 0.15 (То есть, TP сработает если цена вырастет на 15%) |
| `stopLossPercent`    | Процент SL, аналогичный TP, но рассчитывается в обратную сторону `instrumentPrice * (1 - stopLossPercent) |
| `forceCloseOnFinish` | Параметр, отвечающий за то, как `signalReceiver` будет вести себя если робота захотят остановить. В случае если в качестве значения указано `true`, то он принудительно закроет все открытые заявки, ожидающие TP или SL, и завершит работу. В случае с `false` он перестанет принимать сигналы на заявки, и завершит свою работу когда по всем открытым заявкая сработают TP и SL. <b>Not available now</b> |

<br/>Последняя сущность это сама стратегия

```ts
enum StrategyPredict {
  BUY,
  SELL,
}

interface IStrategy {
  predict(candles: Candle[]): StrategyPredict | undefined;
  getMinimalCandlesNumberToApply(): number;
}
```

Согласно википедии:

> Технический индикатор (технический индикатор рынка, индикатор рынка, индикатор технического анализа[1], редко технический индекс; англ. technical market indicator) — функция, построенная на значениях статистических показателей торгов (цены, объём торгов и т. д.)

<br />Большинсто всех индикаторов построенно с целью использования на графиках "японские свечи", и грубо говоря, для программирования этих индикаторов и получения предикта необходима лишь история свечей нужной длины

<div id="bollingerBands">В качестве примера я добавил стратегию основанную на техническом индикаторе <q>BollingerBands</q>, при которой закрытие свечи выше верхней границы коридора - сигнал к покупке, закрытие ниже нижней границы - сигнал к продаже.</div>

| Parameter   | Description                  |
| ----------- | ---------------------------- |
| `periods`   | Количество периодов (свечей) |
| `deviation` | Стандартное отклонение       |

<br/>Подробнее о стратегии <a href="https://en.wikipedia.org/wiki/Bollinger_Bands">здесь</a>

<br/>

# Installation and launch

Для начала необходимо склонировать данный репозиторий, после чего выполнить команду для установки необходимых зависимостей

```
git clone https://github.com/borjomeeee/tinkoff-robot-contest-js.git
cd tinkoff-robot-contest-js
yarn
```

Если у вас компьютер на процессоре M1 и при установке зависимостей появляется ошибка выполнить следующее, после чего заново выполнить команду `yarn && yarn add @tinkoff/invest-js`
```
yarn add grpc-tools --ignore-scripts
pushd node_modules/grpc-tools
node_modules/.bin/node-pre-gyp install --target_arch=x64
popd
```

Также в корневой папке необходимо создать файл `.env` с контентом

```
TINKOFF_API_TOKEN=SOME_TOKEN
```

## Варианты взаимодействия с роботом:

<br />

### Бектестинг стратегии.

Запуск бектестинга производится через команду 

```
yarn backtest
```

Для настройки параметров бектестинга используется файл <a href="https://github.com/borjomeeee/tinkoff-robot-contest-js/blob/main/src/Scripts/backtestingConfig.json">backtestingConfig.json</a>. Ниже представлен список возможных параметров. Также реализован механизм кеширования исторических свечей

<br />

```
{
  "brokerCommission": 0.004, // параметр используется для рассчета эффективности стратегии, и представляет собой комиссию брокера на заявку,

  "strategy": {
    "STRATEGY_NAME": {      // Можно выбрать из изначально заданных (в проекте предусмотрена одна стратегия BollingerBands)
      "param1": "param1",   // Параметры принимаемые стратегией
    }
  },

  "instrumentFigi: "FIGI",  // Figi инструмента
  "candleInverval: "1m",    // Интервал свечей (Возможные варианты: 1m, 5m, 15m, 1h, 1d),

  "startDate": "10/04/2022",// Бектестинг будет производиться на указанном здесь периоде
  "endDate": "11/04/2022",

  signalReceiver: {         // Можно выбрать из изначально заданных (в проекте предусмотрен SampleSignalResolver, выставляющий заявки и фиксирующий TP и SL)
    "RECEIVER_NAME": {      // Параметры принимаемые ресивером
      "param1": "param1"
    }
  }
}
```

Подробнее о параметрах <a href="#bollingerBands">стратегии</a> и <a href="#signalReceiver">signalReceiver-а</a>

<br />

### Запуск робота

Запуск робота производится через команду

```
yarn robot:run
```

Для настройки параметров робота используется файл <a href="https://github.com/borjomeeee/tinkoff-robot-contest-js/blob/main/src/Scripts/runningConfig.json">runningConfig.json</a>. Ниже представлен список возможных параметров.

```
{
  "isSandbox": true,        // Работает с sandbox или нет

  "strategy": {
    "STRATEGY_NAME": {      // Можно выбрать из изначально заданных (в проекте предусмотрена одна стратегия BollingerBands)
      "param1": "param1",   // Параметры принимаемые стратегией
    }
  },

  "instrumentFigi: "FIGI",  // Figi инструмента
  "candleInverval: "1m",    // Интервал свечей (Возможные варианты: 1m, 5m, 15m, 1h, 1d)

  "signalReceiver": {       // Можно выбрать из изначально заданных (в проекте предусмотрен SampleSignalResolver, выставляющий заявки и фиксирующий TP и SL)
    "RECEIVER_NAME": {      // Параметры принимаемые ресивером
      "param1": "param1"
    }
  }
}
```

Подробнее о параметрах <a href="#bollingerBands">стратегии</a> и <a href="#signalReceiver">signalReceiver-а</a>

Остановка робота производится путем ввода в консоль команды, причем в папки "logs" и "reports" будут добавлены логи выполнения и отчет
```
stop
```

<br />

### Другое

Также для удобства тестирования предусмотрены следующие команды

```
yarn accounts (Выводит в консоль список всех счетов пользователя. 
Для вывода счетов с песочницы можно использовать флаг --sandbox)

yarn sandbox:payin --accountId=some_account_id --amount=100000 (Начисляет указанную сумму на счет в песочнице, по умолчанию 100000)

yarn instrument --ticker=AAPL (Выводит figi инструмента по тикеру)
```