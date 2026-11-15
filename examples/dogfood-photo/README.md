# Dogfood photo

Uploads a local PNG through `azure-blob-storage.upload`. Replace `__FIXTURE_PNG__` in
`photo.ecp.json` with an absolute path, or copy the file next to the execution and edit the
`file.path`. Create config `azure-blob-storage/default` with
`plugin` `@executioncontrolprotocol/azure-blob-storage` and a connection string (or account
name + key) before running.
