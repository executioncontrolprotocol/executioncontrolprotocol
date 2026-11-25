/**
 * Execution graph encoder: manifest to React Flow nodes and edges, layout and run status.
 * @category App
 */
export { executionToReactFlow } from "./execution-to-reactflow.js"
export {
  attachAfter,
  CONNECTION_EDIT_HANDLE,
  CONNECTION_EDIT_INCOMPATIBLE,
  CONNECTION_EDIT_INSIDE,
  CONNECTION_EDIT_LOOP,
  CONNECTION_EDIT_NOT_BINDING,
  CONNECTION_EDIT_ORDER,
  CONNECTION_EDIT_SELF,
  connectInput,
  connectInputAndAttach,
  CONNECTION_EDIT_NOT_STEP,
  CONNECTION_EDIT_SOURCE_DETACHED,
  placementManifestForDetachedConnect,
  insertConnectedStep,
  type ConnectInputTarget,
  deleteParallelLine,
  deleteConnector,
  deleteSequenceLink,
  connectorDeletePreview,
  detachedNodeIds,
  disconnectInput,
} from "./connection-edit.js"
export { deleteSelection, isStructureHeaderSelection, type DeleteSelection } from "./delete-selection.js"
export {
  addCapabilityStep,
  allocateAsName,
  findStructure,
  placementForConnectionOrigin,
  type AddStepPlacement,
  type AddStepResult,
} from "./add-step.js"
export { firstMatchingPort, portTypeKind, portsAreCompatible, type PortTypeKind } from "./port-compat.js"
export { sourceVisibleTo } from "./read-order.js"
export {
  connectInputTarget,
  dataConnectionRefusal,
  isDataHandle,
  isValidDataConnection,
  portOnDocument,
} from "./data-connect.js"
export {
  STRUCTURE_EDIT_CONTIGUOUS,
  STRUCTURE_EDIT_EMPTY_STEPS,
  STRUCTURE_EDIT_PARALLEL_MIN,
  STRUCTURE_EDIT_STEP_NOT_FOUND,
  STRUCTURE_EDIT_STRUCTURE_NOT_FOUND,
  deleteStep,
  removeStructure,
  unwrapStructure,
  wrapSelectionIds,
  wrapSteps,
  setLoopField,
  type StructureEditResult,
} from "./structure-edit.js"
export { applyDataEdgeDraft, dataEdgeEditable } from "./edge-panel-logic.js"
export {
  dataEdgeInspectorMeta,
  exprIssuesAtPointer,
  inputManifestPointer,
  readManifestPointer,
  replaceManifestPointer,
  stepManifestPointer,
  valueAtInputPath,
  valueAtStateRef,
  type DataEdgeInspectorMeta,
  type DataEdgeMarkerKind,
} from "./edge-manifest.js"
export {
  collectSteps,
  EXPR_HANDLE_ID,
  extractDataEdges,
  formatExprBadge,
  longestMatchingPortId,
  OUTPUT_HANDLE_ID,
  parseStateRef,
  resolveInputHandle,
  stateKeyFromExpr,
  stateReadsFromExpr,
  walkInputExprs,
  walkInputRefs,
  walkManifestPlacements,
} from "./extract-data-edges.js"
export {
  acceptsPropertyKeys,
  acceptsReactFlowNode,
  EXECUTION_ACCEPTS_NODE_ID,
  EXECUTION_RETURNS_NODE_ID,
  isStepNode,
  portsFromJsonSchemaObject,
  returnsReactFlowNode,
  returnsSourceKeys,
} from "./io-from-schema.js"
export {
  flattenJsonSchemaProperties,
  isJsonObject,
  jsonSchemaObjectProperties,
  type JsonSchemaProperty,
} from "./json-schema.js"
export {
  isExprMarker,
  isRefMarker,
  isScriptMarker,
  isStateMarker,
  refPathFromValue,
} from "./markers.js"
export {
  ensureInputPort,
  ensureOutputPort,
  formatLiteralValue,
  portsForStep,
  truncateLiteralPreview,
} from "./ports-from-schema.js"
export {
  fileRefValueSchemaHint,
  isFileValueSchemaHint,
  typeLabelFromSchema,
  valueSchemaFromEqlLabel,
  valueSchemaFromJsonSchemaProp,
  valueSchemasFromCapabilitySchema,
  type ValueSchemaHint,
} from "./value-schema-hint.js"
export {
  adjustFrameRectForPins,
  containerRects,
  pinContainers,
  applyContainerGeometry,
  CONTAINER_PIN_TOLERANCE,
  isPinnedToContainerEdge,
  type StructureFrameBand,
  type StructureFrameGeometry,
} from "./container-geometry.js"
export {
  boundsAroundNodeIds,
  DEFAULT_NODE_WIDTH,
  frameBounds,
  FRAME_PADDING,
  layoutReactFlowDocument,
  unionRect,
  type BoundsNode,
  type FrameMembership,
  type FrameRect,
} from "./layout.js"
export {
  POSITION_STORAGE_PREFIX,
  parsePositionOverrides,
  placeWithOverrides,
  positionStorageKey,
  prunePositionOverrides,
  reactFlowLayoutFitKey,
  type NodePosition,
  type PositionOverrides,
} from "./positions.js"
export {
  ReactFlowRunProgress,
  reactFlowRunProgress,
  type ReactFlowProgressEventName,
} from "./progress.js"
export {
  applyRunEvent,
  createRunGraphState,
  ifSideRunState,
  reduceRunEvent,
  replayRunEvents,
  type RunGraphLoopItems,
  type RunGraphLoop,
  type RunGraphState,
  type RunGraphStep,
} from "./map-run-events.js"
export {
  END_REPEAT_HANDLE,
  END_RESULTS_HANDLE,
  IF_ELSE_HANDLE,
  IF_THEN_HANDLE,
  LOOP_COLLECT_HANDLE,
  LOOP_COUNT_HANDLE,
  LOOP_INDEX_HANDLE,
  LOOP_INTO_HANDLE,
  LOOP_ITEM_HANDLE,
  LOOP_ITEMS_HANDLE,
  LOOP_REF_HANDLE,
  PARALLEL_PATH_HANDLE_PREFIX,
  loopEndNodeId,
} from "./types.js"
export type {
  CapabilityIoSchemas,
  CapabilitySchemaIndex,
  ReactFlowDocument,
  ReactFlowEdge,
  ReactFlowEdgeKind,
  ReactFlowEncodeOptions,
  ReactFlowEndData,
  ReactFlowIfData,
  ReactFlowIfChoiceDetail,
  ReactFlowLoopItemsData,
  ReactFlowLoopProgressDetail,
  ReactFlowFrameBand,
  ReactFlowFrameData,
  ReactFlowIoData,
  ReactFlowIoKind,
  ReactFlowLoopRoundDetail,
  ReactFlowNode,
  ReactFlowControlEdgeData,
  ReactFlowDataEdgeData,
  ReactFlowPlainEdgeData,
  ReactFlowParallelData,
  ReactFlowPort,
  ReactFlowPortBinding,
  ReactFlowRunLifecycleDetail,
  ReactFlowRunOutcome,
  ReactFlowStepData,
  ReactFlowStepStatus,
  ReactFlowStepStatusDetail,
} from "./types.js"