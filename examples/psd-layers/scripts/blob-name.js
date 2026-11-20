const base = String(input.psdPath).split(/[\\/]/).pop();
return { blobName: `psd-layers/${Date.now()}-${base}` };