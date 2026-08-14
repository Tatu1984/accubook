import type { Prisma } from "@/generated/prisma";

type Db = Prisma.TransactionClient;

/**
 * Tenant-scope validation for client-supplied foreign keys.
 *
 * `withOrgAuth` proves the *caller* belongs to the organization in the URL.
 * It says nothing about the ids inside the request body. A handler that
 * takes `ledgerId` from JSON and writes it straight into a row is trusting
 * the client to only reference its own tenant's records — which is exactly
 * the assumption an attacker breaks.
 *
 * Use this to check every id that arrives from outside before it reaches
 * the database:
 *
 *   const foreign = await findForeignReferences(prisma, orgId, {
 *     ledgerIds: entries.map((e) => e.ledgerId),
 *   });
 *   if (foreign.length) return badRequest("…", foreign);
 *
 * The returned list names the ids that could not be found *within this
 * organization* — which covers both "belongs to another tenant" and
 * "does not exist at all". Both deserve the same answer: a 400 that does
 * not confirm whether the id exists elsewhere.
 */
export type ForeignReference = {
  kind: "ledger" | "costCenter" | "project" | "branch" | "party" | "fiscalYear";
  ids: string[];
};

export type ScopeSpec = Partial<{
  ledgerIds: (string | null | undefined)[];
  costCenterIds: (string | null | undefined)[];
  projectIds: (string | null | undefined)[];
  branchIds: (string | null | undefined)[];
  partyIds: (string | null | undefined)[];
  fiscalYearIds: (string | null | undefined)[];
}>;

/** Drop nulls/undefined and de-duplicate, so optional fields cost nothing. */
function clean(ids: (string | null | undefined)[] | undefined): string[] {
  if (!ids) return [];
  return [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
}

export async function findForeignReferences(
  db: Db,
  organizationId: string,
  spec: ScopeSpec
): Promise<ForeignReference[]> {
  const ledgerIds = clean(spec.ledgerIds);
  const costCenterIds = clean(spec.costCenterIds);
  const projectIds = clean(spec.projectIds);
  const branchIds = clean(spec.branchIds);
  const partyIds = clean(spec.partyIds);
  const fiscalYearIds = clean(spec.fiscalYearIds);

  const [ledgers, costCenters, projects, branches, parties, fiscalYears] = await Promise.all([
    ledgerIds.length
      ? db.ledger.findMany({ where: { id: { in: ledgerIds }, organizationId }, select: { id: true } })
      : Promise.resolve([]),
    costCenterIds.length
      ? db.costCenter.findMany({ where: { id: { in: costCenterIds }, organizationId }, select: { id: true } })
      : Promise.resolve([]),
    projectIds.length
      ? db.project.findMany({ where: { id: { in: projectIds }, organizationId }, select: { id: true } })
      : Promise.resolve([]),
    branchIds.length
      ? db.branch.findMany({ where: { id: { in: branchIds }, organizationId }, select: { id: true } })
      : Promise.resolve([]),
    partyIds.length
      ? db.party.findMany({ where: { id: { in: partyIds }, organizationId }, select: { id: true } })
      : Promise.resolve([]),
    fiscalYearIds.length
      ? db.fiscalYear.findMany({ where: { id: { in: fiscalYearIds }, organizationId }, select: { id: true } })
      : Promise.resolve([]),
  ]);

  const missing = (
    requested: string[],
    found: { id: string }[],
    kind: ForeignReference["kind"]
  ): ForeignReference[] => {
    const ok = new Set(found.map((r) => r.id));
    const bad = requested.filter((id) => !ok.has(id));
    return bad.length ? [{ kind, ids: bad }] : [];
  };

  return [
    ...missing(ledgerIds, ledgers, "ledger"),
    ...missing(costCenterIds, costCenters, "costCenter"),
    ...missing(projectIds, projects, "project"),
    ...missing(branchIds, branches, "branch"),
    ...missing(partyIds, parties, "party"),
    ...missing(fiscalYearIds, fiscalYears, "fiscalYear"),
  ];
}

/** Human-readable summary for the 400 body. */
export function describeForeignReferences(refs: ForeignReference[]): string {
  return refs
    .map((r) => `${r.kind}: ${r.ids.join(", ")}`)
    .join("; ");
}
