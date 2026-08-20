import type { SelectedMavnadimItem } from "../../cases/domain/case-schemas.ts";
import type { DekelCandidateMatch } from "./dekel-matching-service.ts";

export interface MavnadimDekelPackagePreviewItem {
  recommendationKey: string;
  title: string;
  status: string;
  reason: string;
  query: string;
  suggestedDekelSearchTerms: string[];
  candidates: DekelCandidateMatch[];
  responsibleSkill: string;
}

export interface MavnadimDekelPackagePreview {
  selectedMavnadim: {
    catalogItemId: string;
    displayName: string;
    shortLabel: string;
    category: string;
    dimensionsLabel: string;
    basePrice: number;
    sourceImageName: string;
  };
  packageItems: MavnadimDekelPackagePreviewItem[];
}

export async function buildMavnadimDekelPackagePreview(input: {
  selectedMavnadim: SelectedMavnadimItem;
  candidatesPerRecommendation?: number;
  dekelMatcher: {
    findCandidatesByDescription(
      description: string,
      limit?: number,
    ): Promise<DekelCandidateMatch[]>;
  };
}): Promise<MavnadimDekelPackagePreview> {
  const candidatesPerRecommendation = input.candidatesPerRecommendation ?? 2;
  const packageItems: MavnadimDekelPackagePreviewItem[] = [];

  for (const recommendation of orderRecommendations(
    input.selectedMavnadim.ancillaryRecommendations,
  )) {
    if (recommendation.status === "usually_not_required") {
      continue;
    }

    const query = buildAncillaryQuery(recommendation);
    const candidates =
      query.length === 0
        ? []
        : await input.dekelMatcher.findCandidatesByDescription(
            query,
            candidatesPerRecommendation,
          );

    packageItems.push({
      recommendationKey: recommendation.key,
      title: recommendation.title,
      status: recommendation.status,
      reason: recommendation.reason,
      query,
      suggestedDekelSearchTerms: [...recommendation.suggestedDekelSearchTerms],
      candidates,
      responsibleSkill: "rag-engineer",
    });
  }

  return {
    selectedMavnadim: {
      catalogItemId: input.selectedMavnadim.catalogItemId,
      displayName: input.selectedMavnadim.displayName,
      shortLabel: input.selectedMavnadim.shortLabel,
      category: input.selectedMavnadim.category,
      dimensionsLabel: input.selectedMavnadim.dimensionsLabel,
      basePrice: input.selectedMavnadim.basePrice,
      sourceImageName: input.selectedMavnadim.sourceImageName,
    },
    packageItems,
  };
}

function buildAncillaryQuery(recommendation: Pick<
  SelectedMavnadimItem["ancillaryRecommendations"][number],
  "suggestedDekelSearchTerms"
>): string {
  return [...new Set(recommendation.suggestedDekelSearchTerms)]
    .map((term) => term.trim())
    .filter((term) => term.length > 0)
    .join(" ");
}

function orderRecommendations(
  recommendations: SelectedMavnadimItem["ancillaryRecommendations"],
): SelectedMavnadimItem["ancillaryRecommendations"] {
  return [...recommendations].sort((left, right) => {
    const priorityDelta =
      getRecommendationPriority(left.status) - getRecommendationPriority(right.status);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return left.key.localeCompare(right.key);
  });
}

function getRecommendationPriority(status: string): number {
  if (status === "explicitly_requested") {
    return 0;
  }

  if (status === "conditional_review") {
    return 1;
  }

  if (status === "optional") {
    return 2;
  }

  return 3;
}
