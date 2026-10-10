# Changelog

Changes to `@dsh-std/composition` are recorded here.

## Unreleased

- Updated core utility imports to the grouped public entry points.

- Made manifest, driver, and activation ordering comparisons independent of locale-specific collation and added deterministic conflict coverage.

## 0.1.1-rc.1

- Added protocol-defined requirement/support bindings and provider-before-consumer activation ordering.
- Coalesced equivalent component declarations independently of discovery path while preserving conflicts between non-equivalent declarations.

## 0.1.0-rc1

- Defined composition rules, candidate selection, conflicts, and deterministic plan results.
- Added protocol-specific rule registration without extending core.
