  
![logo](https://github.com/skorpion-language/sk-vsce/raw/main/images/card.png)

## Skorpion Extension
Skorpion syntax highlighting extension for Visual Studio Code

Adding:
- Syntax highlighting in Skorpion's files (`.sk`, `.spc`)
- Skorpion's files (`.sk`, `.spc`) icons
- IntelliSense (autocomplete, snippets, hover documentation)

## Version
Corresponds to Skorpion version `2026.10.b01`.

## Example

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

## License
Distributed under [Apache-2.0 License](./LICENSE)
