import { describe, it, expect } from 'vitest'
import {
  buildContentFromForm,
  contentToFormState,
  contentSchemaFromFormState,
  type CustomFieldFormRow,
} from '@/lib/record-content-form'

function row(partial: Partial<CustomFieldFormRow> & Pick<CustomFieldFormRow, 'id' | 'name' | 'type'>): CustomFieldFormRow {
  return {
    value: '',
    listItems: [''],
    ...partial,
  }
}

describe('buildContentFromForm', () => {
  it('stores list as string[]', () => {
    const fields: CustomFieldFormRow[] = [
      row({
        id: '1',
        name: 'tags',
        type: 'list',
        listItems: ['a', 'b', ''],
      }),
    ]
    const c = buildContentFromForm('T', '', '', fields)
    expect(c.title).toBe('T')
    expect(c.tags).toEqual(['a', 'b'])
  })

  it('omits empty list', () => {
    const fields: CustomFieldFormRow[] = [
      row({ id: '1', name: 'empty', type: 'list', listItems: ['', '  '] }),
    ]
    const c = buildContentFromForm('', '', '', fields)
    expect('empty' in c).toBe(false)
  })

  it('parses integer and boolean', () => {
    const fields: CustomFieldFormRow[] = [
      row({ id: '1', name: 'n', type: 'integer', value: '42' }),
      row({ id: '2', name: 'ok', type: 'boolean', value: 'true' }),
    ]
    const c = buildContentFromForm('', '', '', fields)
    expect(c.n).toBe(42)
    expect(c.ok).toBe(true)
  })

  it('sanitizes notes html', () => {
    const c = buildContentFromForm('', '', '<p>hi</p><script>x</script>', [])
    expect(c.notes).toBeDefined()
    expect(String(c.notes)).not.toContain('script')
  })
})

describe('contentToFormState', () => {
  it('detects list arrays', () => {
    const s = contentToFormState({
      title: 'x',
      notes: '',
      items: ['one', 'two'],
    })
    expect(s.customFields).toHaveLength(1)
    expect(s.customFields[0].type).toBe('list')
    expect(s.customFields[0].listItems).toEqual(['one', 'two'])
  })
})

describe('contentSchemaFromFormState', () => {
  it('includes list defaults in schema', () => {
    const fields: CustomFieldFormRow[] = [
      row({ id: '1', name: 'steps', type: 'list', listItems: ['A', 'B'] }),
    ]
    const schema = contentSchemaFromFormState('t', 's', '<p>n</p>', fields)
    expect(schema.customFields?.[0]).toMatchObject({ name: 'steps', type: 'list', value: ['A', 'B'] })
    expect(schema.notes).toBeDefined()
    expect(schema.notes).not.toContain('script')
  })
})
