/**
 * Built-in record templates aligned with institution research domains
 * (see lib/institution-research-types.ts). Not stored in DB.
 */
import type { RecordTemplateContentSchema } from '@/lib/types'

export interface RecordTemplateDefinition {
  id: string
  name: string
  shortDescription: string
  /** Keys from INSTITUTION_RESEARCH_TYPES `.value` */
  researchFieldTags?: string[]
  contentSchema: RecordTemplateContentSchema
}

export const SYSTEM_RECORD_TEMPLATES: RecordTemplateDefinition[] = [
  {
    id: 'sys-clinical-visit',
    name: 'Clinical site visit',
    shortDescription:
      'Protocol, site, and subject identifiers plus visit narrative—typical for regulated clinical workflows.',
    researchFieldTags: ['clinical_research', 'biomedical_health'],
    contentSchema: {
      title: '',
      summary: 'One-line purpose of this visit or encounter (no participant identifiers in free text).',
      notes:
        '<p><strong>Visit checklist</strong> (use the toolbar to add checkboxes or bullets as needed)</p><ul><li><p>Consent / eligibility verified</p></li><li><p>Procedures per protocol</p></li></ul><p><strong>Narrative:</strong> Describe observations, deviations (if any), and follow-up.</p>',
      customFields: [
        { name: 'protocol_id', type: 'text', value: '' },
        { name: 'site_id', type: 'text', value: '' },
        { name: 'subject_identifier', type: 'text', value: '' },
        { name: 'visit_label', type: 'text', value: 'e.g. Visit 2 / Week 4' },
        { name: 'deviations', type: 'text', value: 'None / describe' },
      ],
    },
  },
  {
    id: 'sys-lab-wet-bench',
    name: 'Lab / wet bench',
    shortDescription: 'Experiment, sample, and reagent traceability for bench science.',
    researchFieldTags: ['life_sciences', 'biomedical_health', 'physical_sciences'],
    contentSchema: {
      title: '',
      summary: 'Hypothesis or objective for this experimental run.',
      notes:
        '<p><strong>Methods note:</strong> Reference SOP or lab book entry.</p><ul><li><p>Conditions / variables</p></li><li><p>Observations</p></li></ul>',
      customFields: [
        { name: 'experiment_id', type: 'text', value: '' },
        { name: 'sample_id', type: 'text', value: '' },
        { name: 'reagent_lot', type: 'text', value: '' },
        { name: 'instrument', type: 'text', value: '' },
      ],
    },
  },
  {
    id: 'sys-epidemiology',
    name: 'Epidemiology / public health',
    shortDescription: 'Population, time window, data source, and outcome framing.',
    researchFieldTags: ['public_health_epidemiology'],
    contentSchema: {
      title: '',
      summary: 'Analysis or surveillance summary in one paragraph.',
      notes:
        '<p><strong>Analysis notes</strong></p><ul><li><p>Case definitions</p></li><li><p>Limitations</p></li></ul>',
      customFields: [
        { name: 'population', type: 'text', value: '' },
        { name: 'time_period', type: 'text', value: '' },
        { name: 'data_source', type: 'text', value: '' },
        { name: 'outcome_definition', type: 'text', value: '' },
      ],
    },
  },
  {
    id: 'sys-psychology-behavioral',
    name: 'Psychology / behavioral',
    shortDescription: 'Instrument, session wave, and experimental condition.',
    researchFieldTags: ['psychology_behavioral'],
    contentSchema: {
      title: '',
      summary: 'Session or measurement occasion summary.',
      notes:
        '<p><strong>Procedure:</strong> Steps taken during data collection.</p><p><strong>Quality:</strong> Missing data, interruptions, notes.</p>',
      customFields: [
        { name: 'instrument_or_scale', type: 'text', value: '' },
        { name: 'wave_or_session', type: 'text', value: '' },
        { name: 'condition_or_arm', type: 'text', value: '' },
        { name: 'irb_protocol_ref', type: 'text', value: '' },
      ],
    },
  },
  {
    id: 'sys-survey-social',
    name: 'Survey / social science',
    shortDescription: 'Sampling frame, unit of analysis, and instrument versioning.',
    researchFieldTags: ['social_sciences', 'education_research'],
    contentSchema: {
      title: '',
      summary: 'Data collection wave or study phase.',
      notes:
        '<p><strong>Field notes:</strong> Response rates, mode (web/phone/in-person), notable issues.</p>',
      customFields: [
        { name: 'unit_of_analysis', type: 'text', value: '' },
        { name: 'sampling_frame', type: 'text', value: '' },
        { name: 'instrument_version', type: 'text', value: '' },
      ],
    },
  },
  {
    id: 'sys-computational-data',
    name: 'Computational / data research',
    shortDescription: 'Dataset snapshot, code revision, and reproducibility context.',
    researchFieldTags: ['data_computational', 'engineering_technology'],
    contentSchema: {
      title: '',
      summary: 'What this record documents (analysis, pipeline run, model training, etc.).',
      notes:
        '<p><strong>Reproducibility</strong></p><ul><li><p>Random seed / config captured</p></li><li><p>Outputs stored with version id</p></li></ul>',
      customFields: [
        { name: 'dataset_or_snapshot_id', type: 'text', value: '' },
        { name: 'code_revision', type: 'text', value: 'commit hash or tag' },
        { name: 'environment_notes', type: 'text', value: 'runtime, hardware, key packages' },
      ],
    },
  },
  {
    id: 'sys-environmental-field',
    name: 'Environmental / field study',
    shortDescription: 'Location, observation timing, and measurement context.',
    researchFieldTags: ['environmental_sciences'],
    contentSchema: {
      title: '',
      summary: 'Field session or monitoring period summary.',
      notes:
        '<p><strong>Field log:</strong> Weather, equipment checks, anomalies.</p>',
      customFields: [
        { name: 'location_or_site', type: 'text', value: '' },
        { name: 'observation_date', type: 'date', value: '' },
        { name: 'measurement_type', type: 'text', value: '' },
      ],
    },
  },
  {
    id: 'sys-generic-multidisciplinary',
    name: 'General / multidisciplinary',
    shortDescription: 'Flexible structure for mixed methods or exploratory work.',
    researchFieldTags: ['multidisciplinary', 'humanities', 'other_general'],
    contentSchema: {
      title: '',
      summary: 'High-level objective and scope of this record.',
      notes:
        '<p><strong>Objective</strong></p><p><strong>Methods reference</strong></p><p><strong>Key result</strong></p><p><strong>Follow-ups</strong></p>',
      customFields: [
        { name: 'objective', type: 'text', value: '' },
        { name: 'methods_ref', type: 'text', value: 'SOP, protocol link, or citation' },
        { name: 'key_result', type: 'text', value: '' },
        {
          name: 'next_steps',
          type: 'list',
          value: ['Document decision', 'Schedule review'],
        },
      ],
    },
  },
]

export function getSystemTemplateById(id: string): RecordTemplateDefinition | undefined {
  return SYSTEM_RECORD_TEMPLATES.find((t) => t.id === id)
}

/** Templates tagged for the institution primary research field (first in list). */
export function getRecommendedSystemTemplates(primaryResearchField: string | null | undefined): RecordTemplateDefinition[] {
  if (!primaryResearchField) return []
  return SYSTEM_RECORD_TEMPLATES.filter((t) => t.researchFieldTags?.includes(primaryResearchField))
}
