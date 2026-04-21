import type { CaseRecord } from "../domain/case-schemas.ts";

export interface CaseRepository {
  create(record: CaseRecord): Promise<CaseRecord>;
  findById(caseId: string): Promise<CaseRecord | null>;
  update(record: CaseRecord): Promise<CaseRecord>;
}

export class InMemoryCaseRepository implements CaseRepository {
  private readonly storage = new Map<string, CaseRecord>();

  public async create(record: CaseRecord): Promise<CaseRecord> {
    this.storage.set(record.caseId, record);

    return record;
  }

  public async findById(caseId: string): Promise<CaseRecord | null> {
    return this.storage.get(caseId) ?? null;
  }

  public async update(record: CaseRecord): Promise<CaseRecord> {
    this.storage.set(record.caseId, record);

    return record;
  }
}
