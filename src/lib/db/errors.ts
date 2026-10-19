/**
 * Errors produced by the in-memory database. They mirror the shape PostgREST returned so the
 * existing feature code (`toDomainError`, `QueryError`) keeps working unchanged.
 */
export interface DbError {
  code: string;
  message: string;
  details: string | null;
  hint: string | null;
}

export function dbError(code: string, message: string, details: string | null = null): DbError {
  return { code, message, details, hint: null };
}

/** A domain rule violation: SQLSTATE P0001 with the stable code as the message. */
export class DomainFailure extends Error {
  constructor(
    readonly domainCode: string,
    readonly detail: string = "",
  ) {
    super(domainCode);
    this.name = "DomainFailure";
  }

  toDbError(): DbError {
    return { code: "P0001", message: this.domainCode, details: this.detail, hint: "uzfit_domain_error" };
  }
}

export function fail(code: string, detail?: string): never {
  throw new DomainFailure(code, detail);
}

export const PERMISSION_DENIED = dbError("42501", "permission denied");
