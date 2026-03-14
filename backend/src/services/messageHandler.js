'use strict';

const sessionService = require('../services/sessionService');
const nlpService = require('../services/nlpService');
const productService = require('../services/productService');
const orderService = require('../services/orderService');
const whatsappService = require('../services/whatsappService');
const voiceService = require('../services/voiceService');
const db = require('../db');
const logger = require('../config/logger');
const { SESSION_STATES } = require('../services/sessionStates');

// ── Greeting messages ─────────────────────────────────────────────────────────

const GREETING_TEXT = `👋 Welcome to *KasiConnect*!

Tell me what you'd like to order — you can type in any language (English, Zulu, Sepedi, Setswana).

For example:
• "ke kgopela two breads le milk"
• "ngifuna pap and wors"
• "2 cokes and a pie"

Or send a 🎤 voice note!`;

/**
 * Main entry point — handle an inbound WhatsApp message.
 *
 * @param {object} message  Parsed WhatsApp message object from the webhook
 * @param {string} from     Sender phone number (E.164 without '+')
 */
async function handleMessage(message, from) {
  const session = await sessionService.getOrCreateSession(from);

  // Resolve text — either from a text message or a transcribed voice note
  let text = '';
  if (message.type === 'text') {
    text = message.text?.body || '';
  } else if (message.type === 'audio') {
    text = await handleVoiceNote(message, from);
    if (!text) return; // transcription failed, error already sent
  } else if (message.type === 'interactive') {
    text = message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '';
  } else {
    await whatsappService.sendTextMessage(
      from,
      "Sorry, I only understand text and voice messages right now 😊"
    );
    return;
  }

  const trimmedText = text.trim();
  logger.info('Handling message', { from, state: session.state, textLength: trimmedText.length });

  try {
    switch (session.state) {
      case SESSION_STATES.AWAITING_VENDOR_TYPE:
        await handleGreetingState(from, session, trimmedText);
        break;

      case SESSION_STATES.AWAITING_ITEMS:
        await handleItemsState(from, session, trimmedText);
        break;

      case SESSION_STATES.AWAITING_CLARIFICATION:
        await handleClarificationState(from, session, trimmedText);
        break;

      case SESSION_STATES.AWAITING_CONFIRMATION:
        await handleConfirmationState(from, session, trimmedText);
        break;

      case SESSION_STATES.AWAITING_FULFILMENT_TYPE:
        await handleFulfilmentState(from, session, trimmedText);
        break;

      case SESSION_STATES.ORDER_PLACED:
        // Any message after order placed restarts the flow
        await sessionService.resetSession(from);
        await handleGreetingState(from, await sessionService.getSession(from), trimmedText);
        break;

      default:
        await sessionService.resetSession(from);
        await whatsappService.sendTextMessage(from, GREETING_TEXT);
    }
  } catch (err) {
    logger.error('Error handling message', { from, error: err.message, stack: err.stack });
    await whatsappService.sendTextMessage(
      from,
      "Something went wrong on our end. Please try again in a moment 🙏"
    );
  }
}

// ── State handlers ────────────────────────────────────────────────────────────

/**
 * AWAITING_VENDOR_TYPE state.
 * On first contact, greet and check for repeat order shortcut.
 * Then immediately parse the message as an item request.
 */
async function handleGreetingState(from, session, text) {
  // Look up the customer for returning-customer shortcut
  const customer = await orderService.getCustomerByPhone(from);
  const lastOrder = customer ? await orderService.getLastOrder(customer.id) : null;

  // If the message looks like an order request, try to infer the vendor
  // For MVP: find the first active vendor (in production, routing would be by
  // WhatsApp number / QR code / short link)
  const vendorResult = await db.query(
    `SELECT id, name, type FROM vendors WHERE is_active = TRUE LIMIT 1`
  );
  const vendor = vendorResult.rows[0];

  if (!vendor) {
    await whatsappService.sendTextMessage(from, "Sorry, no vendors are available right now. Please try again later.");
    return;
  }

  await sessionService.updateSession(from, { vendorId: vendor.id, state: SESSION_STATES.AWAITING_ITEMS });

  // Check for repeat order shortcut
  if (lastOrder && lastOrder.items?.length) {
    const itemSummary = lastOrder.items
      .map((i) => `${i.quantity}x ${i.productName}`)
      .join(', ');

    await whatsappService.sendButtonMessage(
      from,
      `👋 Welcome back to *${vendor.name}*!\n\nRepeat your last order?\n_${itemSummary}_`,
      [
        { id: 'repeat_order', title: '✅ Yes, repeat it' },
        { id: 'new_order', title: '🆕 New order' },
      ]
    );
    // Store the last order items in session for quick repeat
    await sessionService.updateSession(from, { lastOrderItems: lastOrder.items });
    return;
  }

  if (text) {
    // Parse immediately if they already typed an order
    await handleItemsState(from, await sessionService.getSession(from), text);
  } else {
    await whatsappService.sendTextMessage(from, `Welcome to *${vendor.name}*! 🛒\n\n${GREETING_TEXT}`);
  }
}

/**
 * AWAITING_ITEMS state.
 * Parse item text, fuzzy-match products, handle ambiguity.
 */
async function handleItemsState(from, session, text) {
  // Handle repeat order button
  if (text.toLowerCase() === 'yes, repeat it' || text === 'repeat_order') {
    if (session.lastOrderItems?.length) {
      const items = session.lastOrderItems.map((i) => ({
        product: { id: i.productId, name: i.productName, price: i.unitPrice },
        quantity: i.quantity,
      }));
      await sessionService.updateSession(from, {
        items,
        state: SESSION_STATES.AWAITING_CONFIRMATION,
      });
      await sendConfirmationMessage(from, items, session.vendorId);
      return;
    }
  }

  if (text.toLowerCase() === 'new order' || text === 'new_order') {
    await whatsappService.sendTextMessage(from, "What would you like to order? 🛒");
    return;
  }

  const parsedItems = nlpService.parseOrderText(text);

  if (parsedItems.length === 0) {
    await whatsappService.sendTextMessage(
      from,
      "I didn't catch what you'd like to order. Try something like:\n• \"2 breads and milk\"\n• \"ngifuna pap and wors\""
    );
    return;
  }

  const { matched, ambiguous, unmatched } = await productService.matchProducts(
    session.vendorId,
    parsedItems
  );

  if (ambiguous.length > 0) {
    // Handle first ambiguous item — ask for clarification
    const firstAmbiguous = ambiguous[0];
    const optionsList = firstAmbiguous.candidates
      .map((c, i) => `${i + 1}. ${c.name} - R${parseFloat(c.price).toFixed(2)}`)
      .join('\n');

    await sessionService.updateSession(from, {
      state: SESSION_STATES.AWAITING_CLARIFICATION,
      pendingClarification: {
        item: firstAmbiguous.item,
        candidates: firstAmbiguous.candidates,
        matchedSoFar: matched,
        remainingAmbiguous: ambiguous.slice(1),
        unmatched,
      },
    });

    await whatsappService.sendTextMessage(
      from,
      `I found multiple options for *"${firstAmbiguous.item.name}"*:\n\n${optionsList}\n\nReply with the number of your choice:`
    );
    return;
  }

  if (unmatched.length > 0 && matched.length === 0) {
    const unmatchedNames = unmatched.map((u) => `"${u.item.name}"`).join(', ');
    await whatsappService.sendTextMessage(
      from,
      `Sorry, I couldn't find ${unmatchedNames} on the menu. Please check the spelling and try again.`
    );
    return;
  }

  // All items matched — merge with any existing session items
  const allItems = [...(session.items || []), ...matched];

  await sessionService.updateSession(from, {
    items: allItems,
    state: SESSION_STATES.AWAITING_CONFIRMATION,
  });

  if (unmatched.length > 0) {
    const unmatchedNames = unmatched.map((u) => `"${u.item.name}"`).join(', ');
    await whatsappService.sendTextMessage(
      from,
      `⚠️ I couldn't find: ${unmatchedNames}. Proceeding with what I found.`
    );
  }

  await sendConfirmationMessage(from, allItems, session.vendorId);
}

/**
 * AWAITING_CLARIFICATION state.
 * Customer picks one of the ambiguous candidates by number.
 */
async function handleClarificationState(from, session, text) {
  const clarification = session.pendingClarification;
  if (!clarification) {
    await sessionService.transitionSession(from, SESSION_STATES.AWAITING_ITEMS);
    await whatsappService.sendTextMessage(from, "What would you like to order?");
    return;
  }

  const choice = parseInt(text.trim(), 10);
  if (isNaN(choice) || choice < 1 || choice > clarification.candidates.length) {
    await whatsappService.sendTextMessage(
      from,
      `Please reply with a number between 1 and ${clarification.candidates.length}.`
    );
    return;
  }

  const chosenProduct = clarification.candidates[choice - 1];
  const resolvedItem = {
    item: clarification.item,
    product: chosenProduct,
    quantity: clarification.item.quantity,
  };

  const allMatched = [...clarification.matchedSoFar, resolvedItem];

  if (clarification.remainingAmbiguous.length > 0) {
    // More ambiguous items — ask about next one
    const nextAmbiguous = clarification.remainingAmbiguous[0];
    const optionsList = nextAmbiguous.candidates
      .map((c, i) => `${i + 1}. ${c.name} - R${parseFloat(c.price).toFixed(2)}`)
      .join('\n');

    await sessionService.updateSession(from, {
      pendingClarification: {
        item: nextAmbiguous.item,
        candidates: nextAmbiguous.candidates,
        matchedSoFar: allMatched,
        remainingAmbiguous: clarification.remainingAmbiguous.slice(1),
        unmatched: clarification.unmatched,
      },
    });

    await whatsappService.sendTextMessage(
      from,
      `Got it! Now for *"${nextAmbiguous.item.name}"*:\n\n${optionsList}\n\nReply with the number:`
    );
    return;
  }

  // All clarified — move to confirmation
  await sessionService.updateSession(from, {
    items: allMatched,
    state: SESSION_STATES.AWAITING_CONFIRMATION,
    pendingClarification: null,
  });

  await sendConfirmationMessage(from, allMatched, session.vendorId);
}

/**
 * AWAITING_CONFIRMATION state.
 * Customer replies YES to confirm or EDIT to change.
 */
async function handleConfirmationState(from, session, text) {
  const normalised = text.toLowerCase().trim();

  if (['yes', 'confirm', 'ok', 'yebo', 'ee', 'ya'].includes(normalised)) {
    // Check if food vendor — ask for fulfilment type
    const vendorResult = await db.query(
      'SELECT type, delivery_fee FROM vendors WHERE id = $1',
      [session.vendorId]
    );
    const vendor = vendorResult.rows[0];

    if (vendor?.type === 'food') {
      await sessionService.transitionSession(from, SESSION_STATES.AWAITING_FULFILMENT_TYPE);
      await whatsappService.sendButtonMessage(
        from,
        `Great! Would you like to *collect* your order or have it *delivered*?${
          vendor.delivery_fee > 0 ? `\n\n🚗 Delivery fee: R${parseFloat(vendor.delivery_fee).toFixed(2)}` : ''
        }`,
        [
          { id: 'collect', title: '🏪 Collect' },
          { id: 'delivery', title: '🚗 Delivery' },
        ]
      );
    } else {
      // Retail vendor — place order immediately (collection only)
      await placeOrder(from, session, 'collection', null);
    }
  } else if (['edit', 'change', 'no', 'cha', 'tjhe'].includes(normalised)) {
    await sessionService.transitionSession(from, SESSION_STATES.AWAITING_ITEMS, { items: [] });
    await whatsappService.sendTextMessage(from, "No problem! Tell me what you'd like to order:");
  } else {
    await whatsappService.sendTextMessage(
      from,
      'Please reply *YES* to confirm your order or *EDIT* to make changes.'
    );
  }
}

/**
 * AWAITING_FULFILMENT_TYPE state.
 * Food vendor — collect vs delivery.
 */
async function handleFulfilmentState(from, session, text) {
  const normalised = text.toLowerCase().trim();

  if (['collect', 'collection', 'pickup', 'pick up'].includes(normalised)) {
    await placeOrder(from, session, 'collection', null);
  } else if (['delivery', 'deliver', 'bring it'].includes(normalised)) {
    await sessionService.updateSession(from, { fulfilmentType: 'delivery' });
    await whatsappService.sendTextMessage(
      from,
      '📍 Please share your delivery address or drop a 📌 location pin:'
    );
  } else if (session.fulfilmentType === 'delivery') {
    // Assume the message is their delivery address
    await placeOrder(from, session, 'delivery', text);
  } else {
    await whatsappService.sendTextMessage(
      from,
      'Please choose: reply *COLLECT* or *DELIVERY*'
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Send the itemised confirmation message to the customer.
 */
async function sendConfirmationMessage(from, items, vendorId) {
  const { lines, subtotal, total } = productService.buildOrderSummary(items);

  const message = [
    '🛒 *Your Order:*\n',
    ...lines,
    `\n*Subtotal: R${subtotal.toFixed(2)}*`,
    '\nReply *YES* to confirm or *EDIT* to change.',
  ].join('\n');

  await whatsappService.sendTextMessage(from, message);
}

/**
 * Place the final order, notify customer, and transition to ORDER_PLACED.
 */
async function placeOrder(from, session, fulfilmentType, deliveryAddress) {
  const vendorResult = await db.query(
    'SELECT id, name, type, delivery_fee FROM vendors WHERE id = $1',
    [session.vendorId]
  );
  const vendor = vendorResult.rows[0];

  const deliveryFee = fulfilmentType === 'delivery' ? parseFloat(vendor.delivery_fee || 0) : 0;
  const { subtotal, total } = productService.buildOrderSummary(session.items, deliveryFee);

  // Upsert customer
  const customer = await orderService.upsertCustomer(from);

  // Create order
  const order = await orderService.createOrder({
    vendorId: session.vendorId,
    customerId: customer.id,
    items: session.items,
    fulfilmentType,
    deliveryAddress,
    deliveryFee,
    subtotal,
    total,
  });

  // Queue position for food vendors
  let queueMsg = '';
  if (vendor.type === 'food') {
    const queuePos = await orderService.getNextQueuePosition(session.vendorId);
    const readyTime = orderService.estimateReadyTime(queuePos);
    const readyTimeStr = readyTime.toLocaleTimeString('en-ZA', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Africa/Johannesburg',
    });

    await orderService.updateOrderStatus(order.id, 'confirmed', {
      queuePosition: queuePos,
      estimatedReadyTime: readyTime,
    });

    queueMsg = `\n\n📋 Queue position: *#${queuePos}*\n⏱️ Estimated ready: *${readyTimeStr}*`;
  }

  const deliveryMsg =
    fulfilmentType === 'delivery'
      ? `\n🚗 Delivery to: ${deliveryAddress || 'your location'}\n💰 Delivery fee: R${deliveryFee.toFixed(2)}`
      : '\n🏪 Collection order';

  await whatsappService.sendTextMessage(
    from,
    `✅ *Order Confirmed!*\n\nOrder #${order.id.slice(-8).toUpperCase()}\nTotal: R${total.toFixed(2)}${deliveryMsg}${queueMsg}\n\nWe'll notify you when it's ready! 🎉`
  );

  await sessionService.transitionSession(from, SESSION_STATES.ORDER_PLACED, {
    lastOrderId: order.id,
  });
}

/**
 * Handle an inbound voice note — transcribe and return as text.
 */
async function handleVoiceNote(message, from) {
  const mediaId = message.audio?.id;
  if (!mediaId) return '';

  try {
    await whatsappService.sendTextMessage(from, '🎤 Processing your voice note...');
    const { buffer, mimeType } = await whatsappService.downloadMedia(mediaId);
    const transcript = await voiceService.transcribeVoiceNote(buffer, mimeType);

    if (!transcript) {
      await whatsappService.sendTextMessage(
        from,
        "Sorry, I couldn't understand your voice note. Please try typing your order."
      );
      return '';
    }

    logger.info('Voice note transcribed', { from, transcript });
    return transcript;
  } catch (err) {
    logger.error('Voice note processing failed', { from, error: err.message });
    await whatsappService.sendTextMessage(
      from,
      "Sorry, I couldn't process your voice note. Please type your order."
    );
    return '';
  }
}

module.exports = { handleMessage };
