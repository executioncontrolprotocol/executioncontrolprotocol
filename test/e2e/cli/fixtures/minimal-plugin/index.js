export default {
  id: "@executioncontrolprotocol/minimal-fixture",
  capabilities: {
    ping: {
      handler: async () => ({ ok: true }),
    },
  },
}
