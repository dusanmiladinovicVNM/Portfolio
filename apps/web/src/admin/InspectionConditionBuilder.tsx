import type {
  InspectionCondition,
  InspectionConditionOperator,
} from '@portfolio/domain';
import {
  INSPECTION_CONDITION_OPERATORS,
  conditionOperatorNeedsValue,
  defaultConditionForField,
  type InspectionSchemaFieldReference,
} from './inspection-schema-builder.js';

interface InspectionConditionBuilderProps {
  readonly label: string;
  readonly condition: InspectionCondition | null;
  readonly fields: readonly InspectionSchemaFieldReference[];
  readonly onChange: (condition: InspectionCondition | null) => void;
}

function firstCondition(
  fields: readonly InspectionSchemaFieldReference[],
): InspectionCondition | null {
  const field = fields[0];
  return field ? defaultConditionForField(field) : null;
}

function fieldFor(
  fields: readonly InspectionSchemaFieldReference[],
  fieldKey: string,
): InspectionSchemaFieldReference | null {
  return (
    fields.find(
      (candidate) =>
        candidate.key.toLowerCase() === fieldKey.toLowerCase(),
    ) ?? null
  );
}

function arrayValue(value: unknown): readonly (string | boolean)[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is string | boolean =>
          typeof entry === 'string' || typeof entry === 'boolean',
      )
    : [];
}

function scalarValue(value: unknown): string | boolean {
  return typeof value === 'boolean' || typeof value === 'string'
    ? value
    : '';
}

function withOperator(
  condition: Extract<InspectionCondition, { fieldKey: string }>,
  operator: InspectionConditionOperator,
  field: InspectionSchemaFieldReference | null,
): InspectionCondition {
  if (!conditionOperatorNeedsValue(operator)) {
    return { fieldKey: condition.fieldKey, operator };
  }
  if (['in', 'notIn'].includes(operator)) {
    const current = arrayValue(condition.value);
    return {
      fieldKey: condition.fieldKey,
      operator,
      value:
        current.length > 0
          ? current
          : field?.type === 'checkbox'
            ? [true]
            : field?.options[0]?.value
              ? [field.options[0].value]
              : [],
    };
  }
  const current = scalarValue(condition.value);
  return {
    fieldKey: condition.fieldKey,
    operator,
    value:
      field?.type === 'checkbox'
        ? typeof current === 'boolean'
          ? current
          : true
        : typeof current === 'string' && current !== ''
          ? current
          : field?.options[0]?.value ?? '',
  };
}

function ConditionValueEditor({
  condition,
  field,
  onChange,
}: {
  readonly condition: Extract<InspectionCondition, { fieldKey: string }>;
  readonly field: InspectionSchemaFieldReference | null;
  readonly onChange: (condition: InspectionCondition) => void;
}) {
  if (!conditionOperatorNeedsValue(condition.operator)) return null;

  const multiple = ['in', 'notIn'].includes(condition.operator);
  if (field?.type === 'checkbox') {
    if (multiple) {
      const values = new Set(arrayValue(condition.value));
      return (
        <fieldset className="schema-condition-values">
          <legend>Values</legend>
          {[true, false].map((value) => (
            <label key={String(value)}>
              <input
                checked={values.has(value)}
                onChange={(event) => {
                  const next = new Set(values);
                  if (event.currentTarget.checked) next.add(value);
                  else next.delete(value);
                  onChange({
                    ...condition,
                    value: [...next],
                  });
                }}
                type="checkbox"
              />
              {value ? 'True / Yes' : 'False / No'}
            </label>
          ))}
        </fieldset>
      );
    }
    return (
      <label>
        Value
        <select
          onChange={(event) =>
            onChange({
              ...condition,
              value: event.currentTarget.value === 'true',
            })
          }
          value={scalarValue(condition.value) === false ? 'false' : 'true'}
        >
          <option value="true">True / Yes</option>
          <option value="false">False / No</option>
        </select>
      </label>
    );
  }

  if (field && field.options.length > 0) {
    if (multiple) {
      const values = new Set(arrayValue(condition.value).map(String));
      return (
        <fieldset className="schema-condition-values">
          <legend>Values</legend>
          {field.options.map((option) => (
            <label key={option.value}>
              <input
                checked={values.has(option.value)}
                onChange={(event) => {
                  const next = new Set(values);
                  if (event.currentTarget.checked) next.add(option.value);
                  else next.delete(option.value);
                  onChange({ ...condition, value: [...next] });
                }}
                type="checkbox"
              />
              {option.label}
            </label>
          ))}
        </fieldset>
      );
    }
    return (
      <label>
        Value
        <select
          onChange={(event) =>
            onChange({ ...condition, value: event.currentTarget.value })
          }
          value={String(scalarValue(condition.value))}
        >
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label>
      {multiple ? 'Values (comma separated)' : 'Value'}
      <input
        onChange={(event) =>
          onChange({
            ...condition,
            value: multiple
              ? event.currentTarget.value
                  .split(',')
                  .map((entry) => entry.trim())
                  .filter(Boolean)
              : event.currentTarget.value,
          })
        }
        type={field?.type === 'date' && !multiple ? 'date' : 'text'}
        value={
          multiple
            ? arrayValue(condition.value).map(String).join(', ')
            : String(scalarValue(condition.value))
        }
      />
    </label>
  );
}

function ConditionNodeEditor({
  condition,
  fields,
  onChange,
  onRemove,
  depth,
}: {
  readonly condition: InspectionCondition;
  readonly fields: readonly InspectionSchemaFieldReference[];
  readonly onChange: (condition: InspectionCondition) => void;
  readonly onRemove: () => void;
  readonly depth: number;
}) {
  const kind = 'all' in condition ? 'all' : 'any' in condition ? 'any' : 'rule';

  function changeKind(next: 'rule' | 'all' | 'any') {
    if (next === kind) return;
    if (next === 'rule') {
      const first = firstCondition(fields);
      if (first) onChange(first);
      return;
    }
    const first = firstCondition(fields);
    onChange(next === 'all' ? { all: first ? [first] : [] } : { any: first ? [first] : [] });
  }

  if (kind === 'rule') {
    const leaf = condition as Extract<InspectionCondition, { fieldKey: string }>;
    const field = fieldFor(fields, leaf.fieldKey);
    return (
      <div className="schema-condition-node schema-condition-rule" data-condition-depth={depth}>
        <div className="schema-condition-node-toolbar">
          <label>
            Kind
            <select
              onChange={(event) =>
                changeKind(event.currentTarget.value as 'rule' | 'all' | 'any')
              }
              value="rule"
            >
              <option value="rule">Rule</option>
              <option value="all">All rules (AND)</option>
              <option value="any">Any rule (OR)</option>
            </select>
          </label>
          <button className="button-secondary" onClick={onRemove} type="button">
            Remove
          </button>
        </div>
        {fields.length === 0 ? (
          <p className="setup-hint">
            No compatible source fields are available for this item.
          </p>
        ) : (
          <div className="schema-condition-rule-grid">
            <label>
              Field
              <select
                onChange={(event) => {
                  const next = fieldFor(fields, event.currentTarget.value);
                  if (next) onChange(defaultConditionForField(next));
                }}
                value={field?.key ?? ''}
              >
                {!field ? <option value="">Choose field</option> : null}
                {fields.map((candidate) => (
                  <option key={candidate.key} value={candidate.key}>
                    {candidate.label} ({candidate.key})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Operator
              <select
                onChange={(event) =>
                  onChange(
                    withOperator(
                      leaf,
                      event.currentTarget.value as InspectionConditionOperator,
                      field,
                    ),
                  )
                }
                value={leaf.operator}
              >
                {INSPECTION_CONDITION_OPERATORS.map((operator) => (
                  <option key={operator} value={operator}>
                    {operator}
                  </option>
                ))}
              </select>
            </label>
            <ConditionValueEditor
              condition={leaf}
              field={field}
              onChange={onChange}
            />
          </div>
        )}
      </div>
    );
  }

  const children = 'all' in condition ? condition.all : condition.any;
  return (
    <div className="schema-condition-node schema-condition-group" data-condition-depth={depth}>
      <div className="schema-condition-node-toolbar">
        <label>
          Match
          <select
            onChange={(event) =>
              changeKind(event.currentTarget.value as 'rule' | 'all' | 'any')
            }
            value={kind}
          >
            <option value="rule">Single rule</option>
            <option value="all">All rules (AND)</option>
            <option value="any">Any rule (OR)</option>
          </select>
        </label>
        <button className="button-secondary" onClick={onRemove} type="button">
          Remove group
        </button>
      </div>
      <div className="schema-condition-children">
        {children.map((child, index) => (
          <ConditionNodeEditor
            condition={child}
            depth={depth + 1}
            fields={fields}
            key={index}
            onChange={(next) => {
              const nextChildren = children.map((candidate, childIndex) =>
                childIndex === index ? next : candidate,
              );
              onChange(
                kind === 'all'
                  ? { all: nextChildren }
                  : { any: nextChildren },
              );
            }}
            onRemove={() => {
              const nextChildren = children.filter(
                (_candidate, childIndex) => childIndex !== index,
              );
              onChange(
                kind === 'all'
                  ? { all: nextChildren }
                  : { any: nextChildren },
              );
            }}
          />
        ))}
      </div>
      <div className="schema-condition-group-actions">
        <button
          className="button-secondary"
          disabled={fields.length === 0}
          onClick={() => {
            const next = firstCondition(fields);
            if (!next) return;
            onChange(
              kind === 'all'
                ? { all: [...children, next] }
                : { any: [...children, next] },
            );
          }}
          type="button"
        >
          Add rule
        </button>
        <button
          className="button-secondary"
          disabled={fields.length === 0}
          onClick={() => {
            const next = firstCondition(fields);
            if (!next) return;
            const group: InspectionCondition = { all: [next] };
            onChange(
              kind === 'all'
                ? { all: [...children, group] }
                : { any: [...children, group] },
            );
          }}
          type="button"
        >
          Add group
        </button>
      </div>
    </div>
  );
}

export function InspectionConditionBuilder({
  label,
  condition,
  fields,
  onChange,
}: InspectionConditionBuilderProps) {
  return (
    <div className="schema-condition-builder">
      <div className="schema-condition-heading">
        <strong>{label}</strong>
        {condition === null ? (
          <button
            className="button-secondary"
            disabled={fields.length === 0}
            onClick={() => onChange(firstCondition(fields))}
            type="button"
          >
            Add condition
          </button>
        ) : null}
      </div>
      {condition ? (
        <ConditionNodeEditor
          condition={condition}
          depth={0}
          fields={fields}
          onChange={onChange}
          onRemove={() => onChange(null)}
        />
      ) : (
        <p className="setup-hint">
          No condition. This item uses its normal visibility/required setting.
        </p>
      )}
    </div>
  );
}
