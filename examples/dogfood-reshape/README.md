# Dogfood reshape

Reshapes an `items` array into `{ title, count }` with one `core.transform` step. The step
declares what it takes (`accepts`) and what it produces (`returns`), binds `items` with `$ref`,
and the host checks the script's result against `returns`. No plugins to install: the core plugin
is bundled with the host.

```sh
ecp execute reshape.ecp.json --input '{"items": [{"title": "First"}, {"title": "Second"}]}'
```
