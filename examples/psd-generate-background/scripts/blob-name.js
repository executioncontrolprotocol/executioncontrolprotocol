const base = String(input.psdPath).split(/[\\/]/).pop();
return { blobName: `psd-generate-background/${Date.now()}-${base}` };