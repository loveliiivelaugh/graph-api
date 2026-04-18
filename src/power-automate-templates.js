const MODERN_FLOW_CATEGORY = 5;

function stringifyClientData(value) {
  return JSON.stringify(value);
}

function buildOpenApiConnection(connectionReference, operationId, extra = {}) {
  return {
    type: "OpenApiConnection",
    inputs: {
      host: {
        connection: {
          referenceName: connectionReference
        }
      },
      operationId,
      ...extra
    }
  };
}

function buildComposeAction(inputs) {
  return {
    type: "Compose",
    inputs
  };
}

function buildRecurrenceTrigger(schedule = "0 9 * * *") {
  const cron = String(schedule || "").trim().split(/\s+/);
  const minute = cron[0] || "0";
  const hour = cron[1] || "9";

  return {
    type: "Recurrence",
    recurrence: {
      frequency: "Day",
      interval: 1,
      schedule: {
        hours: [Number(hour)],
        minutes: [Number(minute)]
      }
    }
  };
}

function buildDefinition({ triggers, actions }) {
  return {
    $schema:
      "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
    contentVersion: "1.0.0.0",
    parameters: {
      $authentication: {
        defaultValue: {},
        type: "SecureObject"
      }
    },
    triggers,
    actions,
    outputs: {}
  };
}

function buildFlowPayload({ name, description, definition, connectionReferences = {}, type = 1 }) {
  return {
    category: MODERN_FLOW_CATEGORY,
    name,
    type,
    primaryentity: "none",
    description,
    clientdata: stringifyClientData({
      properties: {
        definition,
        connectionReferences
      }
    })
  };
}

function buildTeamsConnectionReference(referenceName = "shared_teams") {
  return {
    [referenceName]: {
      api: {
        name: referenceName
      },
      connection: {
        referenceName
      },
      displayName: "Microsoft Teams"
    }
  };
}

function buildApprovalsConnectionReference(referenceName = "shared_approvals") {
  return {
    [referenceName]: {
      api: {
        name: referenceName
      },
      connection: {
        referenceName
      },
      displayName: "Approvals"
    }
  };
}

function buildScheduledTemplate(params = {}) {
  const name = params.name || "Scheduled Flow";
  const message = params.message || "Scheduled automation executed";
  const schedule = params.schedule || "0 9 * * *";

  return buildFlowPayload({
    name,
    description: params.description || "Generated scheduled flow",
    definition: buildDefinition({
      triggers: {
        recurrence: buildRecurrenceTrigger(schedule)
      },
      actions: {
        compose_summary: buildComposeAction(message)
      }
    })
  });
}

function buildTeamsAlertTemplate(params = {}) {
  const name = params.name || "Teams Alert Flow";
  const channel = params.channel || "<teams-channel-id>";
  const summary = params.summary || "Alert from automation";
  const connectionReference = params.connectionReference || "shared_teams";

  return buildFlowPayload({
    name,
    description: params.description || "Generated Teams alert flow",
    connectionReferences: buildTeamsConnectionReference(connectionReference),
    definition: buildDefinition({
      triggers: {
        recurrence: buildRecurrenceTrigger(params.schedule || "0 9 * * *")
      },
      actions: {
        post_message: buildOpenApiConnection(connectionReference, "PostMessageToChannel", {
          parameters: {
            teamId: params.teamId || "<team-id>",
            channelId: channel,
            messageBody: summary
          }
        })
      }
    })
  });
}

function buildApprovalTemplate(params = {}) {
  const name = params.name || "Approval Flow";
  const approver = params.approver || "<approver@contoso.com>";
  const connectionReference = params.connectionReference || "shared_approvals";

  return buildFlowPayload({
    name,
    description: params.description || "Generated approval flow",
    connectionReferences: buildApprovalsConnectionReference(connectionReference),
    definition: buildDefinition({
      triggers: {
        recurrence: buildRecurrenceTrigger(params.schedule || "0 9 * * *")
      },
      actions: {
        create_approval: buildOpenApiConnection(connectionReference, "CreateAnApproval", {
          parameters: {
            approvalType: "ApproveRejectFirstToRespond",
            title: params.title || name,
            assignedTo: approver,
            details: params.details || "Please review this request."
          }
        })
      }
    })
  });
}

const TEMPLATE_BUILDERS = {
  "scheduled-basic": {
    id: "scheduled-basic",
    name: "Scheduled Basic",
    description: "Daily recurrence trigger with a compose action for simple scheduled automation.",
    builder: buildScheduledTemplate
  },
  "teams-alert": {
    id: "teams-alert",
    name: "Teams Alert",
    description: "Recurrence trigger that posts a Microsoft Teams channel message using a Teams connection reference.",
    builder: buildTeamsAlertTemplate
  },
  approval: {
    id: "approval",
    name: "Approval",
    description: "Recurrence trigger that creates an approval using an Approvals connection reference.",
    builder: buildApprovalTemplate
  }
};

export function listTemplates() {
  return Object.values(TEMPLATE_BUILDERS).map(({ id, name, description }) => ({
    id,
    name,
    description
  }));
}

export function getTemplate(id) {
  const template = TEMPLATE_BUILDERS[id];

  if (!template) {
    throw new Error(`Unknown template "${id}".`);
  }

  return {
    id: template.id,
    name: template.name,
    description: template.description
  };
}

export function instantiateTemplate(id, params = {}) {
  const template = TEMPLATE_BUILDERS[id];

  if (!template) {
    throw new Error(`Unknown template "${id}".`);
  }

  return template.builder(params);
}
