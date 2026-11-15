import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const work = process.argv[2] ?? path.join(process.env.TEMP ?? "/tmp", "ecp-a10-probe")
const psd = path.join(root, "fixtures/banner-with-text.psd")

fs.mkdirSync(path.join(work, "scripts"), { recursive: true })
fs.copyFileSync(path.join(root, "scripts/relabel-text-layers.uxp.js"), path.join(work, "scripts/relabel-text-layers.uxp.js"))

const exec = {
  schema: "@executioncontrolprotocol.execution",
  version: "2.0",
  execution: { id: "a10-ps-probe" },
  steps: [
    {
      id: "upload",
      uses: "@executioncontrolprotocol/azure-blob-storage.upload",
      config: "azure-blob-storage/default",
      input: {
        file: { kind: "file", path: psd, mediaType: "image/vnd.adobe.photoshop" },
        blobName: "localize-banner/banner-with-text.psd",
        createReadSas: true,
        contentType: "image/vnd.adobe.photoshop",
      },
      as: "uploaded",
    },
    {
      id: "source",
      uses: "@executioncontrolprotocol/azure-blob-storage.sas",
      config: "azure-blob-storage/default",
      input: {
        blobName: "localize-banner/banner-with-text.psd",
        permissions: "r",
        expiresInSeconds: 86_400,
      },
      as: "source",
    },
    {
      id: "output",
      uses: "@executioncontrolprotocol/azure-blob-storage.sas",
      config: "azure-blob-storage/default",
      input: {
        blobName: "localize-banner/banner-out.png",
        permissions: "cw",
        expiresInSeconds: 86_400,
      },
      as: "output",
    },
    {
      id: "actions",
      uses: "@executioncontrolprotocol/adobe-firefly-services.photoshop-actions",
      config: "adobe-firefly-services/default",
      input: {
        image: { source: { url: { $ref: "state.source.sasUrl" } } },
        options: {
          uxp: {
            source: {
              content: {
                $script: {
                  lang: "js",
                  path: "scripts/relabel-text-layers.uxp.js",
                  params: {
                    texts: {
                      Headline: "Venta de verano",
                      Subhead: "Oferta por tiempo limitado",
                    },
                  },
                },
              },
            },
          },
        },
        outputs: [
          {
            destination: { url: { $ref: "state.output.sasUrl" }, storageType: "azure" },
            mediaType: "image/png",
          },
        ],
      },
      as: "banner",
    },
  ],
}

const out = path.join(work, "probe.ecp.json")
fs.writeFileSync(out, `${JSON.stringify(exec, null, 2)}\n`)
console.log(out)
