export type TemplateId = 'progress' | 'dpr' | 'tally' | 'payroll'

export interface TemplateDef {
  id: TemplateId
  labelKey: string
  fmt: 'pdf' | 'csv'
  needsSite: boolean
  otp: boolean
  enabled: boolean
}

export const TEMPLATES: TemplateDef[] = [
  { id: 'progress', labelKey: 'reports.tpl.progress', fmt: 'pdf', needsSite: false, otp: false, enabled: true },
  { id: 'dpr',      labelKey: 'reports.tpl.dpr',      fmt: 'pdf', needsSite: true,  otp: false, enabled: true },
  { id: 'tally',    labelKey: 'reports.tpl.tally',    fmt: 'csv', needsSite: true,  otp: true,  enabled: true },
  { id: 'payroll',  labelKey: 'reports.tpl.payroll',  fmt: 'csv', needsSite: true,  otp: true,  enabled: false }, // slice 3
]
