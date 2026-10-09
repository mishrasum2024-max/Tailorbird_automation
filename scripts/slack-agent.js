require('dotenv').config();

const crypto = require('crypto');
const { App } = require('@slack/bolt');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

// --------------------------------------------------
// POC TEST TICKETS
// Later these will come from Notion.
// --------------------------------------------------

const tickets = [
  {
    id: 'TB-101',
    priority: 'P1',
    title: 'Invoice Approval',
  },
  {
    id: 'TB-103',
    priority: 'P1',
    title: 'Vendor Management',
  },
  {
    id: 'TB-102',
    priority: 'P2',
    title: 'Budget Export',
  },
  {
    id: 'TB-104',
    priority: 'P0',
    title: 'Approval Status',
  },
];

// --------------------------------------------------
// In-memory request state
//
// POC only.
// Later this should be stored in a persistent store.
// --------------------------------------------------

const approvalRequests = new Map();

// --------------------------------------------------
// Create ticket checkbox options
// --------------------------------------------------

function createTicketOptions(priority) {
  return tickets
    .filter(ticket => ticket.priority === priority)
    .map(ticket => ({
      text: {
        type: 'mrkdwn',
        text: `*${ticket.id}* — ${ticket.title}`,
      },
      value: ticket.id,
    }));
}

// --------------------------------------------------
// Create unique request ID
// --------------------------------------------------

function createRequestId() {
  return `REQ-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

// --------------------------------------------------
// Send approval request to Slack
// --------------------------------------------------

async function sendTicketApprovalMessage() {
  const requestId = createRequestId();

  const result = await app.client.chat.postMessage({
    token: process.env.SLACK_BOT_TOKEN,
    channel: process.env.SLACK_CHANNEL_ID,

    text: `Ticket approval request ${requestId}`,

    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🤖 Ticket Automation Agent POC',
        },
      },

      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            `*Request ID:* \`${requestId}\`\n\n` +
            '*Features ready for test-case generation:*\n' +
            'Please select the tickets you want the agent to process.',
        },
      },

      // ---------------- P1 ----------------

      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*P1 — High Priority*',
        },
      },

      {
        type: 'actions',
        block_id: 'p1_tickets',
        elements: [
          {
            type: 'checkboxes',
            action_id: 'p1_selection',
            options: createTicketOptions('P1'),
          },
        ],
      },

      // ---------------- P2 ----------------

      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*P2 — Medium Priority*',
        },
      },

      {
        type: 'actions',
        block_id: 'p2_tickets',
        elements: [
          {
            type: 'checkboxes',
            action_id: 'p2_selection',
            options: createTicketOptions('P2'),
          },
        ],
      },

      // ---------------- P0 ----------------

      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*P0 — Critical Priority*',
        },
      },

      {
        type: 'actions',
        block_id: 'p0_tickets',
        elements: [
          {
            type: 'checkboxes',
            action_id: 'p0_selection',
            options: createTicketOptions('P0'),
          },
        ],
      },

      {
        type: 'divider',
      },

      // ---------------- APPROVE ----------------

      {
        type: 'actions',
        block_id: 'ticket_approval',
        elements: [
          {
            type: 'button',
            action_id: 'approve_selected_tickets',
            text: {
              type: 'plain_text',
              text: 'Approve Selected Tickets',
            },
            style: 'primary',
            value: requestId,
          },
        ],
      },
    ],
  });

  // ------------------------------------------------
  // Store request state
  // ------------------------------------------------

  approvalRequests.set(requestId, {
    requestId,
    messageTs: result.ts,
    channelId: process.env.SLACK_CHANNEL_ID,
    status: 'WAITING_FOR_APPROVAL',
    selectedTickets: [],
    approvedBy: null,
    approvedAt: null,
    createdAt: new Date().toISOString(),
  });

  console.log('\n📋 Approval request created.');
  console.log(`Request ID: ${requestId}`);
  console.log(`Status: WAITING_FOR_APPROVAL`);
  console.log(`Message TS: ${result.ts}`);

  return requestId;
}

// --------------------------------------------------
// Extract selected tickets from Slack interaction
// --------------------------------------------------

function getSelectedTickets(body) {
  const state = body.state?.values || {};

  const selectedTickets = [];

  const p1Selections =
    state.p1_tickets?.p1_selection?.selected_options || [];

  const p2Selections =
    state.p2_tickets?.p2_selection?.selected_options || [];

  const p0Selections =
    state.p0_tickets?.p0_selection?.selected_options || [];

  const allSelections = [
    ...p1Selections,
    ...p2Selections,
    ...p0Selections,
  ];

  for (const selection of allSelections) {
    selectedTickets.push(selection.value);
  }

  return selectedTickets;
}

// --------------------------------------------------
// Handle approval
// --------------------------------------------------

app.action('approve_selected_tickets', async ({ ack, body, client }) => {
  // Acknowledge Slack immediately.
  await ack();

  console.log('\n🔔 Approval button clicked.');

  const requestId = body.actions?.[0]?.value;

  console.log(`Request ID: ${requestId}`);

  // ------------------------------------------------
  // Validate request ID
  // ------------------------------------------------

  if (!requestId) {
    console.error('❌ Missing request ID.');

    await client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: body.channel.id,
      text:
        '❌ *Approval rejected.*\n\n' +
        'The approval request ID was missing.',
    });

    return;
  }

  // ------------------------------------------------
  // Find request
  // ------------------------------------------------

  const request = approvalRequests.get(requestId);

  if (!request) {
    console.error(`❌ Request not found: ${requestId}`);

    await client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: body.channel.id,
      text:
        '❌ *Approval rejected.*\n\n' +
        `Request \`${requestId}\` was not found or has expired.`,
    });

    return;
  }

  // ------------------------------------------------
  // Duplicate approval protection
  // ------------------------------------------------

  if (request.status !== 'WAITING_FOR_APPROVAL') {
    console.log(
      `⚠️ Request already processed. Current status: ${request.status}`,
    );

    await client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: body.channel.id,
      text:
        '⚠️ *Approval already processed.*\n\n' +
        `Request \`${requestId}\` is already in status ` +
        `\`${request.status}\`.\n\n` +
        'No additional processing was performed.',
    });

    return;
  }

  // ------------------------------------------------
  // Extract selections
  // ------------------------------------------------

  const selectedTickets = getSelectedTickets(body);

  console.log('Selected tickets:', selectedTickets);

  // ------------------------------------------------
  // No-selection safety check
  // ------------------------------------------------

  if (selectedTickets.length === 0) {
    console.log(
      '⚠️ No tickets selected. Request remains WAITING_FOR_APPROVAL.',
    );

    await client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: body.channel.id,
      text:
        '⚠️ *No tickets were selected.*\n\n' +
        'Nothing has been approved or processed.\n\n' +
        `Request \`${requestId}\` remains ` +
        '`WAITING_FOR_APPROVAL`.',
    });

    return;
  }

  // ------------------------------------------------
  // Record human approval
  // ------------------------------------------------

  const approvedBy = body.user?.id || 'UNKNOWN_USER';
  const approvedAt = new Date().toISOString();

  request.selectedTickets = selectedTickets;
  request.approvedBy = approvedBy;
  request.approvedAt = approvedAt;
  request.status = 'APPROVED';

  console.log('\n✅ HUMAN APPROVAL RECEIVED');
  console.log(`Request ID: ${requestId}`);
  console.log(`Approved by: ${approvedBy}`);
  console.log(`Approved at: ${approvedAt}`);
  console.log('Approved tickets:');

  selectedTickets.forEach(ticket => {
    console.log(`   - ${ticket}`);
  });

  // ------------------------------------------------
  // Update the original Slack message
  // ------------------------------------------------

  await client.chat.update({
    token: process.env.SLACK_BOT_TOKEN,
    channel: request.channelId,
    ts: request.messageTs,

    text: `Approval completed for ${requestId}`,

    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '✅ Ticket Approval Completed',
        },
      },

      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            `*Request ID:* \`${requestId}\`\n` +
            `*Status:* \`APPROVED\`\n` +
            `*Approved by:* <@${approvedBy}>\n` +
            `*Approved at:* ${approvedAt}`,
        },
      },

      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            '*Approved tickets:*\n' +
            selectedTickets.map(ticket => `• ${ticket}`).join('\n'),
        },
      },

      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text:
              '🔒 This approval request is locked. ' +
              'No additional approval can be submitted.',
          },
        ],
      },
    ],
  });

  console.log('🔒 Approval request locked.');
});

// --------------------------------------------------
// Start application
// --------------------------------------------------

async function start() {
  try {
    await app.start();

    console.log('🤖 Slack Agent is connected.');

    await sendTicketApprovalMessage();

    console.log('✅ Waiting for human approval...');
  } catch (error) {
    console.error('❌ Slack Agent failed to start.');
    console.error(error);
    process.exit(1);
  }
}

// --------------------------------------------------
// Global error handling
// --------------------------------------------------

process.on('unhandledRejection', error => {
  console.error('❌ Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
  console.error('❌ Uncaught exception:', error);
});

start();