/**
 * Institution research domain / field for onboarding and settings.
 * Stored on institutions.metadata.research_field (string value key).
 */
export const INSTITUTION_RESEARCH_TYPES: { value: string; label: string }[] = [
  { value: 'biomedical_health', label: 'Biomedical & health sciences' },
  { value: 'clinical_research', label: 'Clinical research' },
  { value: 'life_sciences', label: 'Life sciences' },
  { value: 'public_health_epidemiology', label: 'Public health & epidemiology' },
  { value: 'psychology_behavioral', label: 'Psychology & behavioral sciences' },
  { value: 'social_sciences', label: 'Social sciences' },
  { value: 'education_research', label: 'Education research' },
  { value: 'humanities', label: 'Humanities' },
  { value: 'physical_sciences', label: 'Physical sciences' },
  { value: 'engineering_technology', label: 'Engineering & technology' },
  { value: 'environmental_sciences', label: 'Environmental sciences' },
  { value: 'data_computational', label: 'Data & computational research' },
  { value: 'multidisciplinary', label: 'Multidisciplinary' },
  { value: 'other_general', label: 'Other / general research' },
]

const VALUE_SET = new Set(INSTITUTION_RESEARCH_TYPES.map((o) => o.value))

export function isValidInstitutionResearchField(value: string | null | undefined): boolean {
  return Boolean(value && VALUE_SET.has(value))
}

export function getInstitutionResearchFieldLabel(value: string | null | undefined): string | null {
  if (!value) return null
  const found = INSTITUTION_RESEARCH_TYPES.find((o) => o.value === value)
  return found?.label ?? null
}
