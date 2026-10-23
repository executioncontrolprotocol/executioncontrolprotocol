import { policy } from "@executioncontrolprotocol/core"
import { environment, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"
import { approvalPolicy } from "@executioncontrolprotocol/policies"

export default environment(NODE_ENVIRONMENT_ID, "approval").with([
  policy(approvalPolicy).with({
    requireApprovalFor: ["@executioncontrolprotocol/test.echo"],
  }),
])
