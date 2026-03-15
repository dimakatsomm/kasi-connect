import prisma from '../db';
import * as sessionService from '../services/sessionService';
import { parseOrderText } from '../services/nlpService';
import { matchProducts, buildOrderSummary } from '../services/productService';
import * as orderService from '../services/orderService';
import * as whatsappService from '../services/whatsappService';
import { transcribeVoiceNote } from '../services/voiceService';
import { decimalToNumber } from '../utils/prisma';
import logger from '../config/logger';
import { SESSION_STATES } from '../services/sessionStates';
import type { WhatsAppMessage, MatchedItem, LastOrderItem } from '../types';

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
 * @param message  Parsed WhatsApp message object from the webhook
 * @param from     Sender phone number (E.164 without '+')
 */
export async function handleMessage(
  message: WhatsAppMessage,
  from: string
): Promise<void> {
  const session = await sessionService.getOrCreateSession(from);

  // Resolve text — either from a text message or a transcribed voice note
  let text = '';
  if (message.type === 'text') {
    text = message.text?.body ?? '';
  } else if (message.type === 'audio') {
    text = await handleVoiceNote(message, from);
    if (!text) return; // transcription failed, error already sent
  } else if (message.type === 'interactive') {
    text =
      message.interactive?.button_reply?.title ??
      message.interactive?.list_reply?.title ??
      '';
  } else {
    await whatsappService.sendTextMessage(
      from,
      'Sorry, I only understand text and voice messages right now 😊'
    );
    return;
  }

  const trimmedText = text.trim();
  logger.info('Handling message', {
    from,
    state: session.state,
    textLength: trimmedText.length,
  });

  try {
    switch (session.state) {
      case SESSION_STATES.AWAITING_VENDOR_TYPE:
        await handleGreetingState(from, trimmedText);
        break;

      case SESSION_STATES.AWAITING_ITEMS:
        await handleItemsState(from, trimmedText);
        break;

      case SESSION_STATES.AWAITING_CLARIFICATION:
        await handleClarificationState(from, trimmedText);
        break;

      case SESSION_STATES.AWAITING_CONFIRMATION:
        await handleConfirmationState(from, trimmedText);
        break;

      case SESSION_STATES.AWAITING_FULFILMENT_TYPE:
        await handleFulfilmentState(from, trimmedText);
        break;

      case SESSION_STATES.ORDER_PLACED:
        // Any message after order placed restarts the flow
        await sessionService.resetSession(from);
        await handleGreetingState(from, trimmedText);
        break;

      default:
        await sessionService.resetSession(from);
        await whatsappService.sendTextMessage(from, GREETING_TEXT);
    }
  } catch (err) {
    logger.error('Error handling message', {
      from,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    await whatsappService.sendTextMessage(
      from,
      'Something went wrong on our end. Please try again in a moment 🙏'
    );
  }
}

// ── State handlers ────────────────────────────────────────────────────────────

/**
 * AWAITING_VENDOR_TYPE state.
 * On first contact, greet and check for repeat order shortcut.
 * Then immediately parse the message as an item request.
 */
async function handleGreetingState(from: string, text: string): Promise<void> {
  // Look up the customer for returning-customer shortcut
  const customer = await orderService.getCustomerByPhone(from);
  const lastOrder = customer ? await orderService.getLastOrder(customer.id) : null;

  // For MVP: find the first active vendor
  const vendor = await prisma.vendor.findFirst({
    where: { is_active: true },
    orderBy: { created_at: 'asc' },
  });

  if (!vendor) {
    await whatsappService.sendTextMessage(
      from,
      'Sorry, no vendors are available right now. Please try again later.'
    );
    return;
  }

  await sessionService.updateSession(from, {
    vendorId: vendor.id,
    state: SESSION_STATES.AWAITING_ITEMS,
  });

  // Check for repeat order shortcut
  const lastOrderItems = lastOrder?.items as LastOrderItem[] | undefined;
  if (lastOrderItems?.length) {
    const itemSummary = lastOrderItems
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
    await sessionService.updateSession(from, { lastOrderItems });
    return;
  }

  if (text) {
    // Parse immediately if they already typed an order
    await handleItemsState(from, text);
  } else {
    await whatsappService.sendTextMessage(
      from,
      `Welcome to *${vendor.name}*! 🛒\n\n${GREETING_TEXT}`
    );
  }
}

/**
 * AWAITING_ITEMS state.
 * Parse item text, fuzzy-match products, handle ambiguity.
 */
async function handleItemsState(from: string, text: string): Promise<void> {
  const session = await sessionService.getSession(from);
  if (!session) return;

  // Handle repeat order button
  if (
    text.toLowerCase() === 'yes, repeat it' ||
    text === 'repeat_order'
  ) {
    if (session.lastOrderItems?.length) {
      const productIds = session.lastOrderItems.map((i) => i.productId);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));
      const items: MatchedItem[] = session.lastOrderItems
        .map((i) => {
          const product = productMap.get(i.productId);
          if (!product) return null;
          return {
            item: {
              quantity: i.quantity,
              name: i.productName,
              raw: i.productName,
            },
            product,
            quantity: i.quantity,
          };
        })
        .filter((value): value is MatchedItem => value !== null);
      await sessionService.updateSession(from, {
        items,
        state: SESSION_STATES.AWAITING_CONFIRMATION,
      });
      await sendConfirmationMessage(from, items);
      return;
    }
  }

  if (text.toLowerCase() === 'new order' || text === 'new_order') {
    await whatsappService.sendTextMessage(from, 'What would you like to order? 🛒');
    return;
  }

  const parsedItems = parseOrderText(text);

  if (parsedItems.length === 0) {
    await whatsappService.sendTextMessage(
      from,
      "I didn't catch what you'd like to order. Try something like:\n• \"2 breads and milk\"\n• \"ngifuna pap and wors\""
    );
    return;
  }

  const { matched, ambiguous, unmatched } = await matchProducts(
    session.vendorId ?? '',
    parsedItems
  );

  if (ambiguous.length > 0) {
    const firstAmbiguous = ambiguous[0];
    const optionsList = firstAmbiguous.candidates
      .map(
        (c, i) =>
          `${i + 1}. ${c.name} - R${parseFloat(String(c.price)).toFixed(2)}`
      )
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
  const allItems: MatchedItem[] = [...(session.items ?? []), ...matched];

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

  await sendConfirmationMessage(from, allItems);
}

/**
 * AWAITING_CLARIFICATION state.
 * Customer picks one of the ambiguous candidates by number.
 */
async function handleClarificationState(
  from: string,
  text: string
): Promise<void> {
  const session = await sessionService.getSession(from);
  const clarification = session?.pendingClarification;

  if (!clarification) {
    await sessionService.transitionSession(from, SESSION_STATES.AWAITING_ITEMS);
    await whatsappService.sendTextMessage(from, 'What would you like to order?');
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
  const resolvedItem: MatchedItem = {
    item: clarification.item,
    product: chosenProduct,
    quantity: clarification.item.quantity,
  };

  const allMatched: MatchedItem[] = [
    ...clarification.matchedSoFar,
    resolvedItem,
  ];

  if (clarification.remainingAmbiguous.length > 0) {
    const nextAmbiguous = clarification.remainingAmbiguous[0];
    const optionsList = nextAmbiguous.candidates
      .map(
        (c, i) =>
          `${i + 1}. ${c.name} - R${parseFloat(String(c.price)).toFixed(2)}`
      )
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

  await sendConfirmationMessage(from, allMatched);
}

/**
 * AWAITING_CONFIRMATION state.
 * Customer replies YES to confirm or EDIT to change.
 */
async function handleConfirmationState(
  from: string,
  text: string
): Promise<void> {
  const session = await sessionService.getSession(from);
  if (!session) return;

  const normalised = text.toLowerCase().trim();

  if (['yes', 'confirm', 'ok', 'yebo', 'ee', 'ya'].includes(normalised)) {
    const vendor = await prisma.vendor.findUnique({
      where: { id: session.vendorId ?? '' },
      select: {
        type: true,
        delivery_fee: true,
      },
    });

    if (!vendor) {
      await whatsappService.sendTextMessage(
        from,
        'Sorry, we could not find the vendor for this order. Please start again.'
      );
      await sessionService.resetSession(from);
      return;
    }

    const deliveryFeeValue = decimalToNumber(vendor.delivery_fee ?? 0);

    if (vendor.type === 'food') {
      await sessionService.transitionSession(
        from,
        SESSION_STATES.AWAITING_FULFILMENT_TYPE
      );
      await whatsappService.sendButtonMessage(
        from,
        `Great! Would you like to *collect* your order or have it *delivered*?${
          deliveryFeeValue > 0
            ? "\n\n🚗 Delivery fee: R" + deliveryFeeValue.toFixed(2)
            : ''
        }`,
        [
          { id: 'collect', title: '🏪 Collect' },
          { id: 'delivery', title: '🚗 Delivery' },
        ]
      );
    } else {
      await placeOrder(from, 'collection', null);
    }
  } else if (
    ['edit', 'change', 'no', 'cha', 'tjhe'].includes(normalised)
  ) {
    await sessionService.transitionSession(from, SESSION_STATES.AWAITING_ITEMS, {
      items: [],
    });
    await whatsappService.sendTextMessage(
      from,
      "No problem! Tell me what you'd like to order:"
    );
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
async function handleFulfilmentState(
  from: string,
  text: string
): Promise<void> {
  const session = await sessionService.getSession(from);
  if (!session) return;

  const normalised = text.toLowerCase().trim();

  if (['collect', 'collection', 'pickup', 'pick up'].includes(normalised)) {
    await placeOrder(from, 'collection', null);
  } else if (['delivery', 'deliver', 'bring it'].includes(normalised)) {
    await sessionService.updateSession(from, { fulfilmentType: 'delivery' });
    await whatsappService.sendTextMessage(
      from,
      '📍 Please share your delivery address or drop a 📌 location pin:'
    );
  } else if (session.fulfilmentType === 'delivery') {
    // Assume the message is their delivery address
    await placeOrder(from, 'delivery', text);
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
async function sendConfirmationMessage(
  from: string,
  items: MatchedItem[]
): Promise<void> {
  const { lines, subtotal } = buildOrderSummary(items);

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
async function placeOrder(
  from: string,
  fulfilmentType: 'collection' | 'delivery',
  deliveryAddress: string | null
): Promise<void> {
  const session = await sessionService.getSession(from);
  if (!session) return;

  const vendor = await prisma.vendor.findUnique({
    where: { id: session.vendorId ?? '' },
    select: {
      id: true,
      name: true,
      type: true,
      delivery_fee: true,
    },
  });

  if (!vendor) {
    await whatsappService.sendTextMessage(
      from,
      'Sorry, the vendor is currently unavailable. Please try again later.'
    );
    await sessionService.resetSession(from);
    return;
  }

  const deliveryFee =
    fulfilmentType === 'delivery'
      ? decimalToNumber(vendor.delivery_fee ?? 0)
      : 0;
  const { subtotal, total } = buildOrderSummary(session.items, deliveryFee);

  const customer = await orderService.upsertCustomer(from);

  const order = await orderService.createOrder({
    vendorId: session.vendorId ?? '',
    customerId: customer.id,
    items: session.items,
    fulfilmentType,
    deliveryAddress,
    deliveryFee,
    subtotal,
    total,
  });

  let queueMsg = '';
  if (vendor.type === 'food' && order.queue_position != null) {
    const queuePos = order.queue_position;
    const readyTime = orderService.estimateReadyTime(queuePos);
    const readyTimeStr = readyTime.toLocaleTimeString('en-ZA', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Africa/Johannesburg',
    });

    await orderService.updateOrderStatus(order.id, 'confirmed', {
      estimatedReadyTime: readyTime,
    });

    queueMsg = `\n\n📋 Queue position: *#${queuePos}*\n⏱️ Estimated ready: *${readyTimeStr}*`;
  }

  const deliveryMsg =
    fulfilmentType === 'delivery'
      ? `\n🚗 Delivery to: ${deliveryAddress ?? 'your location'}\n💰 Delivery fee: R${deliveryFee.toFixed(2)}`
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
async function handleVoiceNote(
  message: WhatsAppMessage,
  from: string
): Promise<string> {
  const mediaId = message.audio?.id;
  if (!mediaId) return '';

  try {
    await whatsappService.sendTextMessage(from, '🎤 Processing your voice note...');
    const { buffer, mimeType } = await whatsappService.downloadMedia(mediaId);
    const transcript = await transcribeVoiceNote(buffer, mimeType);

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
    logger.error('Voice note processing failed', {
      from,
      error: err instanceof Error ? err.message : String(err),
    });
    await whatsappService.sendTextMessage(
      from,
      "Sorry, I couldn't process your voice note. Please type your order."
    );
    return '';
  }
}
