/** Protocol declaration and negotiation interfaces. */
export type { ApiReference } from './identity.js'
export {
  defineProtocolDeclaration,
  validateProtocolDeclaration,
  type ProtocolDeclaration,
  type ProtocolRequirement,
  type ProtocolSupport,
} from './protocol.js'
export {
  ProtocolCatalog,
  type ProtocolDefinition,
  type ProtocolIssue,
  type ProtocolNegotiationInput,
  type ProtocolNegotiationOutcome,
  type NegotiatedProtocol,
  type NegotiationReport,
} from './negotiation.js'
