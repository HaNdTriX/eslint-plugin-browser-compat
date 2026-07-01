import type { Rule } from "eslint";

import {
  isPolyfilled,
  lookupCompatibility,
  resolveBrowserTargets,
  resolveSettings,
} from "../bcd";
import type { PluginSettings } from "../types";

type AstNode = Rule.Node & {
  parent?: AstNode | null;
  [key: string]: unknown;
};

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
    ((parent.importKind as string | undefined) === "type" ||
      (parent.parent &&
        (parent.parent as AstNode).type === "ImportDeclaration" &&
        ((parent.parent as AstNode).importKind as string | undefined) ===
          "type"))
  ) {
    return true;
  }

  return false;
}

function isInTypePosition(node: AstNode): boolean {
  let child: AstNode = node;
  let current = node.parent;

  while (current) {
    const currentType = current.type as string;
    const key = getDirectChildKey(current, child);

    if (!key) {
      child = current;
      current = current.parent;
      continue;
    }

    if (currentType.startsWith("TS")) {
      const isRuntimeBranch =
        ((currentType === "TSAsExpression" ||
          currentType === "TSSatisfiesExpression") &&
          key === "expression") ||
        (currentType === "TSNonNullExpression" && key === "expression");

      if (!isRuntimeBranch) {
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

  while (current.type === "MemberExpression") {
    if (
      current.computed ||
      (current.property as AstNode).type !== "Identifier"
    ) {
      return null;
    }

    parts.unshift((current.property as { name: string }).name);
    current = current.object as AstNode;
  }

  if (current.type === "Identifier") {
    parts.unshift(current.name);
    return parts.join(".");
  }

  return null;
}

function memberRootIdentifier(node: AstNode): AstNode | null {
  let current: AstNode = node;

  while (current.type === "MemberExpression") {
    current = current.object as AstNode;
  }

  if (current.type === "Identifier") {
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
  if (node.type !== "Identifier") {
    return false;
  }

  let scope = context.sourceCode.getScope(node) as ReturnType<
    Rule.RuleContext["sourceCode"]["getScope"]
  > | null;
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
      context.settings as PluginSettings | undefined,
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

    return {
      Identifier(node) {
        const current = node as AstNode;

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

        reportUnsupported(current, current.name as string);
      },

      CallExpression(node) {
        const current = node as AstNode;

        if ((current.callee as AstNode).type === "Identifier") {
          const callee = current.callee as AstNode;
          if (isLocallyDefinedIdentifier(context, callee)) {
            return;
          }

          const name = (callee as { name: string }).name;
          reportUnsupported(current, name, `${name}()`);
          return;
        }

        if ((current.callee as AstNode).type === "MemberExpression") {
          const callee = current.callee as AstNode;
          if (hasLocalMemberRoot(context, callee)) {
            return;
          }

          const feature = memberPath(callee);
          if (feature) {
            reportUnsupported(
              current,
              feature,
              `${normalizeFeatureKey(feature)}()`,
            );
          }
        }
      },

      NewExpression(node) {
        const current = node as AstNode;

        if ((current.callee as AstNode).type === "Identifier") {
          const callee = current.callee as AstNode;
          if (isLocallyDefinedIdentifier(context, callee)) {
            return;
          }

          reportUnsupported(current, (callee as { name: string }).name);
          return;
        }

        if ((current.callee as AstNode).type === "MemberExpression") {
          const callee = current.callee as AstNode;
          if (hasLocalMemberRoot(context, callee)) {
            return;
          }

          const feature = memberPath(callee);
          if (feature) {
            reportUnsupported(current, feature);
          }
        }
      },

      MemberExpression(node) {
        const current = node as AstNode;

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
