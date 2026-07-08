import type { Rule, Scope } from "eslint";
import {
  isPolyfilled,
  lookupCompatibility,
  resolveBrowserTargets,
  resolveSettings,
} from "../bcd";
import type { PluginSettings } from "../types";

type AstNode = Rule.Node;
type IdentifierNode = Extract<AstNode, { type: "Identifier" }>;
type MemberExpressionNode = Extract<AstNode, { type: "MemberExpression" }>;
type CallExpressionNode = Extract<AstNode, { type: "CallExpression" }>;
type NewExpressionNode = Extract<AstNode, { type: "NewExpression" }>;

function isAstNode(value: unknown): value is AstNode {
  return value !== null && typeof value === "object" && "type" in value;
}

function isIdentifierNode(value: unknown): value is IdentifierNode {
  return isAstNode(value) && value.type === "Identifier";
}

function isMemberExpressionNode(value: unknown): value is MemberExpressionNode {
  return isAstNode(value) && value.type === "MemberExpression";
}

function getNodeStringProperty(node: object, key: string): string | undefined {
  const value = Reflect.get(node, key);
  return typeof value === "string" ? value : undefined;
}

function getStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((entry) => typeof entry === "string")
    : undefined;
}

function getBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readPluginSettings(value: unknown): PluginSettings | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  return {
    browsers: getStringArray(Reflect.get(value, "browsers")),
    targets: getStringArray(Reflect.get(value, "targets")),
    polyfills: getStringArray(Reflect.get(value, "polyfills")),
    lintAllEsApis: getBoolean(Reflect.get(value, "lintAllEsApis")),
    ignoreConditionalChecks: getBoolean(
      Reflect.get(value, "ignoreConditionalChecks"),
    ),
    browserslistOpts:
      Reflect.get(value, "browserslistOpts") &&
      typeof Reflect.get(value, "browserslistOpts") === "object"
        ? Reflect.get(value, "browserslistOpts")
        : undefined,
  };
}

function getPluginSettingsFromContext(
  contextSettings: Rule.RuleContext["settings"],
): PluginSettings | undefined {
  return (
    readPluginSettings(Reflect.get(contextSettings, "compat")) ??
    readPluginSettings(contextSettings)
  );
}

function getDirectChildKey(parent: AstNode, child: AstNode): string | null {
  for (const [key, value] of Object.entries(parent)) {
    if (key === "parent") {
      continue;
    }

    if (value === child) {
      return key;
    }

    if (Array.isArray(value) && value.includes(child)) {
      return key;
    }
  }

  return null;
}

function isTypeOnlyImport(node: AstNode): boolean {
  const parent = node.parent;
  if (!parent) {
    return false;
  }

  if (
    (parent.type === "ImportSpecifier" ||
      parent.type === "ImportDefaultSpecifier" ||
      parent.type === "ImportNamespaceSpecifier") &&
    (getNodeStringProperty(parent, "importKind") === "type" ||
      (parent.parent?.type === "ImportDeclaration" &&
        getNodeStringProperty(parent.parent, "importKind") === "type"))
  ) {
    return true;
  }

  return false;
}

function isInTypePosition(node: AstNode): boolean {
  let child: AstNode = node;
  let current = node.parent;

  while (current) {
    const currentType = current.type;
    const key = getDirectChildKey(current, child);

    if (!key) {
      child = current;
      current = current.parent;
      continue;
    }

    if (currentType.startsWith("TS")) {
      if (key !== "expression") {
        return true;
      }
    }

    child = current;
    current = current.parent;
  }

  return false;
}

function isDeclarationIdentifier(
  node: AstNode,
  parent: AstNode | null | undefined,
): boolean {
  if (!parent) {
    return false;
  }

  if (parent.type === "VariableDeclarator" && parent.id === node) {
    return true;
  }

  if (
    (parent.type === "FunctionDeclaration" ||
      parent.type === "FunctionExpression") &&
    parent.id === node
  ) {
    return true;
  }

  if (parent.type === "ClassDeclaration" && parent.id === node) {
    return true;
  }

  if (
    parent.type === "ImportSpecifier" ||
    parent.type === "ImportDefaultSpecifier" ||
    parent.type === "ImportNamespaceSpecifier"
  ) {
    return true;
  }

  if (parent.type === "Property" && parent.key === node && !parent.computed) {
    return true;
  }

  if (
    parent.type === "MemberExpression" &&
    parent.property === node &&
    !parent.computed
  ) {
    return true;
  }

  return false;
}

function inConditionalTest(node: AstNode): boolean {
  let child: AstNode | undefined = node;
  let current: AstNode | null | undefined = node.parent;

  while (current) {
    if (
      current.type === "IfStatement" ||
      current.type === "WhileStatement" ||
      current.type === "DoWhileStatement"
    ) {
      if (current.test === child) {
        return true;
      }
    }

    if (current.type === "ForStatement" && current.test === child) {
      return true;
    }

    if (current.type === "ConditionalExpression" && current.test === child) {
      return true;
    }

    child = current;
    current = current.parent;
  }

  return false;
}

function memberPath(node: AstNode): string | null {
  const parts: string[] = [];
  let current: AstNode = node;

  while (isMemberExpressionNode(current)) {
    if (current.computed || current.property.type !== "Identifier") {
      return null;
    }

    parts.unshift(current.property.name);

    if (!isAstNode(current.object)) {
      return null;
    }

    current = current.object;
  }

  if (isIdentifierNode(current)) {
    parts.unshift(current.name);
    return parts.join(".");
  }

  return null;
}

function memberRootIdentifier(node: AstNode): AstNode | null {
  let current: AstNode = node;

  while (isMemberExpressionNode(current)) {
    if (!isAstNode(current.object)) {
      return null;
    }

    current = current.object;
  }

  if (isIdentifierNode(current)) {
    return current;
  }

  return null;
}

function normalizeFeatureKey(featureKey: string): string {
  return featureKey.replace(/^window\./, "").replace(/^globalThis\./, "");
}

function isLocallyDefinedIdentifier(
  context: Rule.RuleContext,
  node: AstNode,
): boolean {
  if (!isIdentifierNode(node)) {
    return false;
  }

  let scope: Scope.Scope | null = context.sourceCode.getScope(node);
  while (scope) {
    const variable = scope.set.get(node.name);
    if (variable) {
      return variable.defs.length > 0;
    }
    scope = scope.upper;
  }

  return false;
}

function hasLocalMemberRoot(context: Rule.RuleContext, node: AstNode): boolean {
  const root = memberRootIdentifier(node);
  if (!root) {
    return false;
  }

  return isLocallyDefinedIdentifier(context, root);
}

const compatRule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Lint browser compatibility using @mdn/browser-compat-data",
      recommended: true,
      url: "https://github.com/handtrix/eslint-plugin-browser-compat/blob/main/docs/rules/compat.md",
    },
    schema: [],
    messages: {
      unsupported: "{{feature}} is not supported in {{targets}}",
    },
  },

  create(context) {
    const settings = resolveSettings(
      getPluginSettingsFromContext(context.settings),
    );
    const targets = resolveBrowserTargets(settings);

    const reportUnsupported = (
      node: AstNode,
      feature: string,
      displayFeature?: string,
    ): void => {
      const normalized = normalizeFeatureKey(feature);

      if (!settings.lintAllEsApis && /^[A-Z]/.test(normalized)) {
        return;
      }

      if (isPolyfilled(normalized, settings)) {
        return;
      }

      if (!settings.ignoreConditionalChecks && inConditionalTest(node)) {
        return;
      }

      const compatibility = lookupCompatibility(normalized, targets);
      if (compatibility.unsupported.length === 0) {
        return;
      }

      const targetText = compatibility.unsupported
        .map((target) => `${target.browser} ${target.version}`)
        .join(", ");

      context.report({
        node,
        messageId: "unsupported",
        data: {
          feature: displayFeature ?? normalized,
          targets: targetText,
        },
      });
    };

    const reportIdentifierCallee = (
      host: CallExpressionNode | NewExpressionNode,
      callee: IdentifierNode,
      displayFeature?: string,
    ): void => {
      if (isLocallyDefinedIdentifier(context, callee)) {
        return;
      }

      reportUnsupported(host, callee.name, displayFeature);
    };

    const reportMemberCallee = (
      host: CallExpressionNode | NewExpressionNode,
      callee: MemberExpressionNode,
      displayFeature?: string,
    ): void => {
      if (hasLocalMemberRoot(context, callee)) {
        return;
      }

      const feature = memberPath(callee);
      if (!feature) {
        return;
      }

      reportUnsupported(host, feature, displayFeature);
    };

    return {
      Identifier(node) {
        const current = node;

        if (isTypeOnlyImport(current) || isInTypePosition(current)) {
          return;
        }

        if (isLocallyDefinedIdentifier(context, current)) {
          return;
        }

        if (isDeclarationIdentifier(current, current.parent)) {
          return;
        }

        if (
          current.parent?.type === "CallExpression" &&
          current.parent.callee === current
        ) {
          return;
        }

        if (
          current.parent?.type === "NewExpression" &&
          current.parent.callee === current
        ) {
          return;
        }

        reportUnsupported(current, current.name);
      },

      CallExpression(node) {
        if (isIdentifierNode(node.callee)) {
          reportIdentifierCallee(node, node.callee, `${node.callee.name}()`);
          return;
        }

        if (isMemberExpressionNode(node.callee)) {
          const feature = memberPath(node.callee);
          if (!feature) {
            return;
          }

          reportMemberCallee(
            node,
            node.callee,
            `${normalizeFeatureKey(feature)}()`,
          );
        }
      },

      NewExpression(node) {
        if (isIdentifierNode(node.callee)) {
          reportIdentifierCallee(node, node.callee);
          return;
        }

        if (isMemberExpressionNode(node.callee)) {
          reportMemberCallee(node, node.callee);
        }
      },

      MemberExpression(node) {
        const current = node;

        if (
          current.parent?.type === "MemberExpression" &&
          current.parent.object === current
        ) {
          return;
        }

        if (
          current.parent?.type === "CallExpression" &&
          current.parent.callee === current
        ) {
          return;
        }

        if (hasLocalMemberRoot(context, current)) {
          return;
        }

        const feature = memberPath(current);
        if (feature) {
          reportUnsupported(current, feature);
        }
      },
    };
  },
};

export default compatRule;
