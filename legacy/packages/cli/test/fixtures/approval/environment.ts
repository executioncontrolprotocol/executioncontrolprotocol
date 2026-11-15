import { extension, policy, testExtension } from "@executioncontrolprotocol/core"
import { environment, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"
import { approvalPolicy } from "@executioncontrolprotocol/plugin-approval"

export default environment(NODE_ENVIRONMENT_ID, "approval").with([
  extension(testExtension),
  policy(approvalPolicy).with({
    requireApprovalFor: ["@executioncontrolprotocol/test.echo"],
  }),
])
