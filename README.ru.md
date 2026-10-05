![logo](https://github.com/skorpion-language/sk-vsce/raw/main/images/card.png)

## Расширение Skorpion
Расширение для подсветки синтаксиса языка Skorpion в Visual Studio Code.

Добавляет:
- Подсветку синтаксиса в файлах Skorpion (`.sk`, `.spc`)
- Иконки для файлов Skorpion (`.sk`, `.spc`)
- IntelliSense (автодополнение, сниппеты, документация при наведении)

## Версия
Соответствует версии Skorpion `2026.10.b01`.

## Пример

```sk
use std/io

const MyError{msg: string} = new Error

void main(arr args) {
    try {
        throw MyError{msg: "Error"}
    } catch (MyError as e) {
        io.sendln(e.msg)
    } catch {
        io.sendln("Error")
    }
}
```

## Лицензия
Распространяется по [лицензии Apache-2.0](./LICENSE)