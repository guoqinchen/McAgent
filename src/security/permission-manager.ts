export type PermissionAction = 'allow' | 'deny' | 'prompt';

export type PermissionOperator = 'equals' | 'contains' | 'starts_with' | 'ends_with' | 'regex';

export interface PermissionCondition {
  field: string;
  operator: PermissionOperator;
  value: string;
}

export interface PermissionRule {
  id: string;
  name: string;
  action: PermissionAction;
  target: string;
  conditions: PermissionCondition[];
  priority: number;
}

export interface PermissionContext {
  sessionId: string;
  toolName: string;
  timestamp: Date;
  userRole?: string;
  ipAddress?: string;
  args?: Record<string, unknown>;
}

export interface PermissionResult {
  allowed: boolean;
  message: string;
  requiresConfirmation: boolean;
  matchingRule?: PermissionRule;
}

export class PermissionManager {
  private rules: PermissionRule[] = [];
  private confirmationRequired: Set<string> = new Set();

  constructor(initialRules?: PermissionRule[]) {
    this.rules = initialRules || this.getDefaultRules();
  }

  private getDefaultRules(): PermissionRule[] {
    return [
      {
        id: 'read-only-tools',
        name: 'Allow read-only tools',
        action: 'allow',
        target: '*',
        conditions: [
          { field: 'toolName', operator: 'contains', value: 'get_' },
          { field: 'toolName', operator: 'contains', value: 'list_' },
          { field: 'toolName', operator: 'contains', value: 'search' },
        ],
        priority: 10,
      },
      {
        id: 'file-operations-home',
        name: 'Restrict file operations to home directory',
        action: 'allow',
        target: '*',
        conditions: [
          { field: 'args.path', operator: 'starts_with', value: process.env.HOME || '' },
        ],
        priority: 5,
      },
    ];
  }

  async checkPermission(context: PermissionContext): Promise<PermissionResult> {
    const applicableRules = this.rules
      .filter(rule => this.matchesTarget(rule, context))
      .filter(rule => this.evaluateConditions(rule.conditions, context))
      .sort((a, b) => b.priority - a.priority);

    if (applicableRules.length === 0) {
      return {
        allowed: false,
        message: 'No matching permission rules found',
        requiresConfirmation: false,
      };
    }

    const highestPriorityRule = applicableRules[0];
    
    switch (highestPriorityRule.action) {
      case 'allow':
        return {
          allowed: true,
          message: `Permission granted by rule: ${highestPriorityRule.name}`,
          requiresConfirmation: false,
          matchingRule: highestPriorityRule,
        };
      
      case 'deny':
        return {
          allowed: false,
          message: `Permission denied by rule: ${highestPriorityRule.name}`,
          requiresConfirmation: false,
          matchingRule: highestPriorityRule,
        };
      
      case 'prompt':
        return {
          allowed: this.confirmationRequired.has(context.sessionId),
          message: `Action requires confirmation`,
          requiresConfirmation: true,
          matchingRule: highestPriorityRule,
        };
      
      default:
        return {
          allowed: false,
          message: 'Unknown permission action',
          requiresConfirmation: false,
        };
    }
  }

  private matchesTarget(rule: PermissionRule, context: PermissionContext): boolean {
    if (rule.target === '*') return true;
    if (rule.target === context.toolName) return true;
    if (rule.target.endsWith('*') && context.toolName.startsWith(rule.target.slice(0, -1))) {
      return true;
    }
    return false;
  }

  private evaluateConditions(conditions: PermissionCondition[], context: PermissionContext): boolean {
    if (conditions.length === 0) return true;

    return conditions.every(condition => this.evaluateCondition(condition, context));
  }

  private evaluateCondition(condition: PermissionCondition, context: PermissionContext): boolean {
    const value = this.extractValue(condition.field, context);
    if (value === undefined) return false;

    const stringValue = String(value);

    switch (condition.operator) {
      case 'equals':
        return stringValue === condition.value;
      
      case 'contains':
        return stringValue.includes(condition.value);
      
      case 'starts_with':
        return stringValue.startsWith(condition.value);
      
      case 'ends_with':
        return stringValue.endsWith(condition.value);
      
      case 'regex':
        try {
          const regex = new RegExp(condition.value);
          return regex.test(stringValue);
        } catch {
          return false;
        }
      
      default:
        return false;
    }
  }

  private extractValue(field: string, context: PermissionContext): unknown {
    if (field === 'toolName') return context.toolName;
    if (field === 'sessionId') return context.sessionId;
    if (field === 'userRole') return context.userRole;
    if (field === 'ipAddress') return context.ipAddress;
    
    if (field.startsWith('args.')) {
      const argName = field.slice(5);
      return context.args?.[argName];
    }
    
    return undefined;
  }

  setConfirmation(sessionId: string, confirmed: boolean): void {
    if (confirmed) {
      this.confirmationRequired.add(sessionId);
    } else {
      this.confirmationRequired.delete(sessionId);
    }
  }

  addRule(rule: PermissionRule): void {
    this.rules.push(rule);
  }

  removeRule(ruleId: string): void {
    this.rules = this.rules.filter(r => r.id !== ruleId);
  }

  getRules(): PermissionRule[] {
    return [...this.rules];
  }

  getRuleById(ruleId: string): PermissionRule | undefined {
    return this.rules.find(r => r.id === ruleId);
  }
}

export const permissionManager = new PermissionManager();
