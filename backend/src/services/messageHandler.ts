import prisma from '../db';
import * as sessionService from '../services/sessionService';
import { parseOrderText } from '../services/nlpService';
import { matchProducts, buildOrderSummary } from '../services/productService';
import * as orderService from '../services/orderService';
import * as whatsappService from '../services/whatsappService';
import { findNearbyVendors, getVendorWhatsAppNumber, getVendorByPhone } from '../services/vendorDiscoveryService';
import { transcribeVoiceNote } from '../services/voiceService';
import { decimalToNumber } from '../utils/prisma';
import logger from '../config/logger';
import { SESSION_STATES } from '../services/sessionStates';
import type { WhatsAppMessage, MatchedItem, LastOrderItem, VendorSector } from '../types';

// ── Greeting messages ─────────────────────────────────────────────────────────

const GREETING_TEXT = `👋 Welcome to *KasiConnect*!

Where would you like to order from?`;

const ORDER_PROMPT = `What would you like to order? 🛒

You can type in any language (English, Zulu, Sepedi, Setswana).

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
  // Check if this message is from a vendor responding to a fulfilment request
  const vendor = await getVendorByPhone(from);
  if (vendor) {
    await handleVendorMessage(from, message, vendor.id);
    return;
  }

  const session = await sessionService.getOrCreateSession(from);

  // Resolve text — either from a text message, transcribed voice note, or interactive reply
  let text = '';
  if (message.type === 'text') {
    text = message.text?.body ?? '';
  } else if (message.type === 'audio') {
    text = await handleVoiceNote(message, from);
    if (!text) return; // transcription failed, error already sent
  } else if (message.type === 'interactive') {
    text =
      message.interactive?.button_reply?.id ??
      message.interactive?.list_reply?.id ??
      message.interactive?.button_reply?.title ??
      message.interactive?.list_reply?.title ??
      '';
  } else if (message.type === 'location') {
    // Location messages are handled in the location state
    if (session.state === SESSION_STATES.AWAITING_LOCATION) {
      const lat = message.location?.latitude;
      const lng = message.location?.longitude;
      if (lat != null && lng != null) {
        await handleLocationState(from, '', lat, lng);
        return;
      }
    }
    await whatsappService.sendTextMessage(
      from,
      'Thanks for the location! But I wasn\'t expecting that right now. Send "Hi" to start ordering.'
    );
    return;
  } else {
    await whatsappService.sendTextMessage(
      from,
      'Sorry, I only understand text, voice and location messages right now 😊'
    );
    return;
  }

  const trimmedText = text.trim();
  logger.info('Handling message', {
    from,
    state: session.state,
    textLength: trimmedText.length,
  });

  // ── Global STOP handler — unsubscribe from vendor specials ────────────────
  if (trimmedText.toLowerCase() === 'stop') {
    const updatedCount = await prisma.vendorSubscription.updateMany({
      where: { customer: { phone: from }, is_active: true },
      data: { is_active: false },
    });
    if (updatedCount.count > 0) {
      await whatsappService.sendTextMessage(
        from,
        '✅ You\'ve been unsubscribed from vendor specials. Send "Hi" to continue ordering.'
      );
      return;
    }
    // If not subscribed to anything, fall through to normal flow
  }

  // ── Global RESTART handler — reset session from any non-initial state ─────
  if (
    session.state !== SESSION_STATES.AWAITING_SECTOR &&
    /^(hi|hello|hey|howzit|sawubona|dumelang|dumela|restart|start over|cancel|menu)$/i.test(trimmedText)
  ) {
    await sessionService.resetSession(from);
    await sendSectorPrompt(from);
    return;
  }

  try {
    switch (session.state) {
      case SESSION_STATES.AWAITING_SECTOR:
        await handleSectorState(from, trimmedText);
        break;

      case SESSION_STATES.AWAITING_LOCATION:
        await handleLocationState(from, trimmedText);
        break;

      case SESSION_STATES.AWAITING_VENDOR_SELECTION:
        await handleVendorSelectionState(from, trimmedText);
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

      case SESSION_STATES.AWAITING_VENDOR_RESPONSE:
        // Customer messaging while waiting for vendor — let them know
        await whatsappService.sendTextMessage(
          from,
          '⏳ Your order has been sent to the vendor. We\'re waiting for them to confirm. Hang tight!'
        );
        break;

      case SESSION_STATES.ORDER_PLACED:
        // Check if the customer is in an active chat with a vendor
        if (session.lastOrderId && await relayChatToVendor(from, trimmedText, session.lastOrderId)) {
          break; // message relayed
        }
        // Otherwise restart the flow
        await sessionService.resetSession(from);
        await sendSectorPrompt(from);
        break;

      default:
        await sessionService.resetSession(from);
        await sendSectorPrompt(from);
    }
  } catch (err) {
    const responseData = (err != null && typeof err === 'object' && 'response' in err)
      ? (err as { response?: { data?: unknown } }).response?.data
      : undefined;
    logger.error('Error handling message', {
      from,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      responseData,
    });
    try {
      await whatsappService.sendTextMessage(
        from,
        'Something went wrong on our end. Please try again in a moment 🙏'
      );
    } catch (sendErr) {
      logger.error('Failed to send error-recovery message', {
        from,
        error: sendErr instanceof Error ? sendErr.message : String(sendErr),
      });
    }
  }
}

// ── State handlers ────────────────────────────────────────────────────────────

/**
 * Send the sector selection prompt (Spaza vs Restaurant).
 */
async function sendSectorPrompt(from: string): Promise<void> {
  await whatsappService.sendButtonMessage(
    from,
    GREETING_TEXT,
    [
      { id: 'sector_spaza', title: '🏪 Spaza Shop' },
      { id: 'sector_restaurant', title: '🍔 Restaurant' },
    ]
  );
}

/**
 * AWAITING_SECTOR state.
 * Customer picks Spaza or Restaurant.
 */
async function handleSectorState(from: string, text: string): Promise<void> {
  const normalised = text.toLowerCase().trim();

  let sector: VendorSector | null = null;

  if (
    normalised === 'sector_spaza' ||
    normalised.includes('spaza') ||
    normalised === '1' ||
    normalised === '🏪 spaza shop'
  ) {
    sector = 'spaza';
  } else if (
    normalised === 'sector_restaurant' ||
    normalised.includes('restaurant') ||
    normalised === '2' ||
    normalised === '🍔 restaurant'
  ) {
    sector = 'restaurant';
  }

  if (!sector) {
    // If it's a greeting, show the prompt
    if (/^(hi|hello|hey|howzit|sawubona|dumelang|dumela)$/i.test(normalised) || !normalised) {
      await sendSectorPrompt(from);
      return;
    }
    await whatsappService.sendTextMessage(
      from,
      'Please choose *Spaza Shop* or *Restaurant*:'
    );
    await sendSectorPrompt(from);
    return;
  }

  await sessionService.updateSession(from, {
    sector,
    state: SESSION_STATES.AWAITING_LOCATION,
  });

  const sectorLabel = sector === 'spaza' ? 'Spaza Shop' : 'Restaurant';
  await whatsappService.sendLocationRequest(
    from,
    `Great! You chose *${sectorLabel}*.\n\n📍 Share your location so I can find nearby ${sectorLabel}s, or type your area name.`
  );
}

/**
 * AWAITING_LOCATION state.
 * Customer shares location via pin or text.
 */
async function handleLocationState(
  from: string,
  text: string,
  lat?: number,
  lng?: number
): Promise<void> {
  const session = await sessionService.getSession(from);
  if (!session?.sector) {
    await sessionService.resetSession(from);
    await sendSectorPrompt(from);
    return;
  }

  let customerLat = lat;
  let customerLng = lng;

  // If no coordinates provided, we can't do radius search — show all vendors of the type
  if (customerLat == null || customerLng == null) {
    // Try to parse "lat,lng" text as a fallback
    const coordMatch = text.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
      customerLat = parseFloat(coordMatch[1]);
      customerLng = parseFloat(coordMatch[2]);
    }
  }

  if (customerLat != null && customerLng != null) {
    // Save location and find nearby vendors
    await sessionService.updateSession(from, {
      customerLatitude: customerLat,
      customerLongitude: customerLng,
    });

    const nearby = await findNearbyVendors(session.sector, customerLat, customerLng);

    if (nearby.length === 0) {
      // Try a wider radius (10 km) before giving up
      const widerNearby = await findNearbyVendors(session.sector, customerLat, customerLng, 10);
      if (widerNearby.length > 0) {
        await sessionService.updateSession(from, {
          nearbyVendors: widerNearby,
          state: SESSION_STATES.AWAITING_VENDOR_SELECTION,
        });
        await sendVendorSelectionList(from, widerNearby, session.sector);
        return;
      }

      const sectorLabel = session.sector === 'spaza' ? 'Spaza Shops' : 'Restaurants';
      await whatsappService.sendTextMessage(
        from,
        `😔 No ${sectorLabel} found near you. Let's start over — you can try a different option.`
      );
      await sessionService.resetSession(from);
      await sendSectorPrompt(from);
      return;
    }

    await sessionService.updateSession(from, {
      nearbyVendors: nearby,
      state: SESSION_STATES.AWAITING_VENDOR_SELECTION,
    });

    await sendVendorSelectionList(from, nearby, session.sector);
    return;
  }

  // Text-based area search — filter by address containing the area name
  const vendorType = session.sector === 'spaza' ? 'retail' : 'food';
  const areaText = text.trim();

  // First try to find vendors matching the area name in their address
  let allVendors = await prisma.vendor.findMany({
    where: {
      is_active: true,
      type: vendorType as 'retail' | 'food',
      ...(areaText ? { address: { contains: areaText, mode: 'insensitive' as const } } : {}),
    },
    select: { id: true, name: true, type: true, address: true },
    take: 10,
  });

  // If no area-specific results, broaden to all vendors of the sector type
  if (allVendors.length === 0 && areaText) {
    allVendors = await prisma.vendor.findMany({
      where: {
        is_active: true,
        type: vendorType as 'retail' | 'food',
      },
      select: { id: true, name: true, type: true, address: true },
      take: 10,
    });
  }

  // If still nothing in this sector, try the OTHER sector for the area
  if (allVendors.length === 0) {
    const otherType = vendorType === 'retail' ? 'food' : 'retail';
    allVendors = await prisma.vendor.findMany({
      where: {
        is_active: true,
        type: otherType as 'retail' | 'food',
        ...(areaText ? { address: { contains: areaText, mode: 'insensitive' as const } } : {}),
      },
      select: { id: true, name: true, type: true, address: true },
      take: 10,
    });

    if (allVendors.length > 0) {
      const otherLabel = otherType === 'retail' ? 'Spaza Shops' : 'Restaurants';
      await whatsappService.sendTextMessage(
        from,
        `I couldn't find your selection, but I found ${otherLabel} in *${areaText}*:`
      );
    }
  }

  if (allVendors.length === 0) {
    await whatsappService.sendTextMessage(
      from,
      `😔 No shops or restaurants found${areaText ? ` in *${areaText}*` : ''}. Let's start over.`
    );
    await sessionService.resetSession(from);
    await sendSectorPrompt(from);
    return;
  }

  const nearbyVendors = allVendors.map((v) => ({
    id: v.id,
    name: v.name,
    type: v.type,
    distance: 0,
  }));

  await sessionService.updateSession(from, {
    nearbyVendors,
    state: SESSION_STATES.AWAITING_VENDOR_SELECTION,
  });

  await sendVendorSelectionList(from, nearbyVendors, session.sector);
}

/**
 * Send the list of nearby vendors for selection.
 */
async function sendVendorSelectionList(
  from: string,
  vendors: Array<{ id: string; name: string; distance: number }>,
  sector: VendorSector
): Promise<void> {
  const sectorLabel = sector === 'spaza' ? 'Spaza Shops' : 'Restaurants';

  const rows = vendors.map((v, i) => ({
    id: `vendor_${v.id}`,
    title: v.name,
    description: v.distance > 0 ? `${v.distance} km away` : undefined,
  }));

  await whatsappService.sendListMessage(
    from,
    `📍 *Nearby ${sectorLabel}:*\n\nPick one to start ordering:`,
    `View ${sectorLabel}`,
    rows
  );
}

/**
 * AWAITING_VENDOR_SELECTION state.
 * Customer picks a vendor from the nearby list.
 */
async function handleVendorSelectionState(
  from: string,
  text: string
): Promise<void> {
  const session = await sessionService.getSession(from);
  if (!session?.nearbyVendors?.length) {
    await sessionService.resetSession(from);
    await sendSectorPrompt(from);
    return;
  }

  const normalised = text.toLowerCase().trim();

  // Match by button/list ID (vendor_<uuid>)
  let selectedVendor = session.nearbyVendors.find(
    (v) => `vendor_${v.id}` === normalised
  );

  // Match by number
  if (!selectedVendor) {
    const choice = parseInt(normalised, 10);
    if (!isNaN(choice) && choice >= 1 && choice <= session.nearbyVendors.length) {
      selectedVendor = session.nearbyVendors[choice - 1];
    }
  }

  // Match by name (fuzzy)
  if (!selectedVendor) {
    selectedVendor = session.nearbyVendors.find(
      (v) => v.name.toLowerCase().includes(normalised) || normalised.includes(v.name.toLowerCase())
    );
  }

  if (!selectedVendor) {
    await whatsappService.sendTextMessage(
      from,
      'Please pick a vendor from the list by number or name:'
    );
    await sendVendorSelectionList(from, session.nearbyVendors, session.sector ?? 'spaza');
    return;
  }

  await sessionService.updateSession(from, {
    vendorId: selectedVendor.id,
    state: SESSION_STATES.AWAITING_ITEMS,
  });

  // Check for repeat order shortcut
  const customer = await orderService.getCustomerByPhone(from);
  const lastOrder = customer ? await orderService.getLastOrder(customer.id) : null;
  const lastOrderItems = lastOrder?.items as LastOrderItem[] | undefined;

  if (lastOrderItems?.length) {
    // Check if last order was from this vendor
    const lastVendorMatch = lastOrder && 'vendor_id' in lastOrder && lastOrder.vendor_id === selectedVendor.id;
    if (lastVendorMatch) {
      const itemSummary = lastOrderItems
        .map((i) => `${i.quantity}x ${i.productName}`)
        .join(', ');

      await whatsappService.sendButtonMessage(
        from,
        `👋 Welcome back to *${selectedVendor.name}*!\n\nRepeat your last order?\n_${itemSummary}_`,
        [
          { id: 'repeat_order', title: '✅ Yes, repeat it' },
          { id: 'new_order', title: '🆕 New order' },
        ]
      );
      await sessionService.updateSession(from, { lastOrderItems });
      return;
    }
  }

  await whatsappService.sendTextMessage(
    from,
    `You're ordering from *${selectedVendor.name}*! 🛒\n\n${ORDER_PROMPT}`
  );
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
        where: { id: { in: productIds }, is_available: true },
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
    await whatsappService.sendTextMessage(from, ORDER_PROMPT);
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
    parsedItems,
    text
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

// ── Vendor response handler ───────────────────────────────────────────────────

/**
 * Handle a message from a vendor.
 * Supports:
 *  - accept/decline pending orders
 *  - "SPECIAL: ..." to broadcast a daily special to subscribers
 *  - "chat_customer_<orderId>" button to initiate live chat
 *  - relay messages while in active chat
 *  - "END" to close the active chat
 */
async function handleVendorMessage(
  vendorPhone: string,
  message: WhatsAppMessage,
  vendorId: string
): Promise<void> {
  // Extract text from text messages OR interactive button replies
  let text = '';
  if (message.type === 'text') {
    text = message.text?.body ?? '';
  } else if (message.type === 'interactive') {
    text =
      message.interactive?.button_reply?.id ??
      message.interactive?.button_reply?.title ??
      message.interactive?.list_reply?.id ??
      message.interactive?.list_reply?.title ??
      '';
  }
  const trimmed = text.trim();
  const normalised = trimmed.toLowerCase();

  // ── 1. Active chat relay ──────────────────────────────────────────────────
  const vendorSession = await sessionService.getVendorSession(vendorPhone);

  if (vendorSession?.activeCustomerPhone) {
    // "END" closes the chat
    if (normalised === 'end') {
      await sessionService.clearVendorChat(vendorPhone);
      await whatsappService.sendTextMessage(
        vendorPhone,
        '✅ Chat ended.'
      );
      await whatsappService.sendTextMessage(
        vendorSession.activeCustomerPhone,
        '💬 The vendor has ended the chat. Send "Hi" to start a new order.'
      );
      return;
    }

    // Relay message to the customer
    await whatsappService.sendTextMessage(
      vendorSession.activeCustomerPhone,
      `💬 *Vendor:* ${trimmed}`
    );
    return;
  }

  // ── 2. Specials broadcast ─────────────────────────────────────────────────
  if (normalised.startsWith('special:') || normalised.startsWith('specials:')) {
    const specialMessage = trimmed.slice(trimmed.indexOf(':') + 1).trim();
    if (!specialMessage) {
      await whatsappService.sendTextMessage(
        vendorPhone,
        'Please include a message after "SPECIAL:". E.g.:\n_SPECIAL: Half-price pap & wors today only!_'
      );
      return;
    }

    // Record the special
    await prisma.dailySpecial.create({
      data: {
        vendor_id: vendorId,
        message: specialMessage,
      },
    });

    // Broadcast to active subscribers
    const subscribers = await prisma.vendorSubscription.findMany({
      where: { vendor_id: vendorId, is_active: true },
      select: { customer: { select: { phone: true } } },
    });

    let sentCount = 0;
    for (const sub of subscribers) {
      await whatsappService
        .sendTextMessage(
          sub.customer.phone,
          `🌟 *Daily Special!*\n\n${specialMessage}\n\n_Reply STOP to unsubscribe._`
        )
        .then(() => { sentCount++; })
        .catch((err: Error) =>
          logger.warn('Failed to send special to subscriber', {
            phone: sub.customer.phone,
            error: err.message,
          })
        );
    }

    await whatsappService.sendTextMessage(
      vendorPhone,
      `📢 Special sent to ${sentCount} subscriber${sentCount !== 1 ? 's' : ''}!`
    );
    return;
  }

  // ── 3. Chat initiation via button ─────────────────────────────────────────
  const chatMatch = normalised.match(/^chat_customer_(.+)$/);
  if (chatMatch) {
    const orderId = chatMatch[1];
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        vendor_id: true,
        customer: { select: { phone: true } },
      },
    });

    if (!order || order.vendor_id !== vendorId || !order.customer?.phone) {
      await whatsappService.sendTextMessage(vendorPhone, 'Order not found.');
      return;
    }

    await sessionService.updateVendorSession(vendorPhone, {
      vendorId,
      activeCustomerPhone: order.customer.phone,
      activeOrderId: orderId,
    });

    await whatsappService.sendTextMessage(
      vendorPhone,
      `💬 You're now chatting with the customer for order #${orderId.slice(-8).toUpperCase()}.\n\nType your message — it will be relayed directly.\nSend *END* to close the chat.`
    );

    await whatsappService.sendTextMessage(
      order.customer.phone,
      `💬 The vendor has started a chat about your order #${orderId.slice(-8).toUpperCase()}. You can reply here.`
    );
    return;
  }

  // ── 4. Accept / decline pending orders ────────────────────────────────────
  const pendingOrder = await prisma.order.findFirst({
    where: {
      vendor_id: vendorId,
      status: 'pending',
    },
    orderBy: { created_at: 'asc' },
    include: {
      customer: { select: { phone: true } },
      order_items: {
        include: { product: { select: { name: true } } },
        orderBy: { created_at: 'asc' },
      },
    },
  });

  if (!pendingOrder) {
    await whatsappService.sendTextMessage(
      vendorPhone,
      'No pending orders at the moment.'
    );
    return;
  }

  const customerPhone = pendingOrder.customer?.phone;
  if (!customerPhone) {
    logger.error('Pending order has no customer phone', { orderId: pendingOrder.id });
    return;
  }

  if (['yes', 'accept', 'ok', 'yebo', 'ee', 'ya', 'can do'].includes(normalised)) {
    // Vendor accepts — confirm the order
    await orderService.updateOrderStatus(pendingOrder.id, 'confirmed');

    let queueMsg = '';
    if (pendingOrder.queue_position != null) {
      const readyTime = orderService.estimateReadyTime(pendingOrder.queue_position);
      const readyTimeStr = readyTime.toLocaleTimeString('en-ZA', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Johannesburg',
      });
      await orderService.updateOrderStatus(pendingOrder.id, 'confirmed', {
        estimatedReadyTime: readyTime,
      });
      queueMsg = `\n⏱️ Estimated ready: *${readyTimeStr}*`;
    }

    await whatsappService.sendButtonMessage(
      vendorPhone,
      `✅ Order #${pendingOrder.id.slice(-8).toUpperCase()} confirmed! Please start preparing.`,
      [{ id: `chat_customer_${pendingOrder.id}`, title: '💬 Chat customer' }]
    );

    // Notify the customer
    const customerSession = await sessionService.getSession(customerPhone);
    if (customerSession) {
      await sessionService.updateSession(customerPhone, {
        state: SESSION_STATES.ORDER_PLACED,
        lastOrderId: pendingOrder.id,
      });
    }

    await whatsappService.sendTextMessage(
      customerPhone,
      `✅ *Order Accepted!*\n\nOrder #${pendingOrder.id.slice(-8).toUpperCase()} has been accepted by the vendor!${queueMsg}\n\nWe'll notify you when it's ready! 🎉`
    );
  } else if (['no', 'reject', 'cancel', 'cannot', 'can\'t', 'cha'].includes(normalised)) {
    // Vendor rejects
    await orderService.updateOrderStatus(pendingOrder.id, 'cancelled');

    await whatsappService.sendTextMessage(
      vendorPhone,
      `❌ Order #${pendingOrder.id.slice(-8).toUpperCase()} has been declined.`
    );

    // Notify the customer
    const customerSession = await sessionService.getSession(customerPhone);
    if (customerSession) {
      await sessionService.resetSession(customerPhone);
    }

    await whatsappService.sendTextMessage(
      customerPhone,
      `😔 Sorry, the vendor is unable to fulfil your order #${pendingOrder.id.slice(-8).toUpperCase()} right now.\n\nSend "Hi" to start a new order.`
    );
  } else {
    await whatsappService.sendTextMessage(
      vendorPhone,
      `📦 You have a pending order #${pendingOrder.id.slice(-8).toUpperCase()}.\n\nReply *YES* to accept or *NO* to decline.`
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Attempt to relay a customer message to a vendor who has an active chat with them.
 * Returns true if the message was relayed, false otherwise.
 */
async function relayChatToVendor(
  customerPhone: string,
  text: string,
  orderId: string
): Promise<boolean> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { vendor_id: true, vendor: { select: { whatsapp_number: true } } },
  });

  if (!order?.vendor?.whatsapp_number) return false;

  const vendorPhone = order.vendor.whatsapp_number;
  const vendorSession = await sessionService.getVendorSession(vendorPhone);

  if (vendorSession?.activeCustomerPhone === customerPhone) {
    await whatsappService.sendTextMessage(
      vendorPhone,
      `💬 *Customer:* ${text}`
    );
    return true;
  }

  return false;
}

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
 * Place the order, send to vendor for fulfilment confirmation,
 * and transition to AWAITING_VENDOR_RESPONSE.
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
  const { lines, subtotal, total } = buildOrderSummary(session.items, deliveryFee);

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

  // Auto-subscribe the customer to this vendor's specials
  await prisma.vendorSubscription.upsert({
    where: {
      uq_vendor_customer: {
        vendor_id: session.vendorId ?? '',
        customer_id: customer.id,
      },
    },
    update: { is_active: true },
    create: {
      vendor_id: session.vendorId ?? '',
      customer_id: customer.id,
    },
  });

  // Tell the customer we're checking with the vendor
  const deliveryMsg =
    fulfilmentType === 'delivery'
      ? `\n🚗 Delivery to: ${deliveryAddress ?? 'your location'}\n💰 Delivery fee: R${deliveryFee.toFixed(2)}`
      : '\n🏪 Collection order';

  await whatsappService.sendTextMessage(
    from,
    `📤 *Order Sent!*\n\nOrder #${order.id.slice(-8).toUpperCase()}\nTotal: R${total.toFixed(2)}${deliveryMsg}\n\n⏳ Waiting for *${vendor.name}* to confirm your order...`
  );

  await sessionService.updateSession(from, {
    state: SESSION_STATES.AWAITING_VENDOR_RESPONSE,
    pendingOrderId: order.id,
    lastOrderId: order.id,
  });

  // Send fulfilment request to the vendor via WhatsApp
  const vendorPhone = await getVendorWhatsAppNumber(session.vendorId ?? '');
  if (vendorPhone) {
    const orderSummary = lines.join('\n');
    const fulfilmentLabel = fulfilmentType === 'delivery' ? 'Delivery' : 'Collection';

    await whatsappService.sendButtonMessage(
      vendorPhone,
      `📦 *New Order!*\n\nOrder #${order.id.slice(-8).toUpperCase()}\nType: ${fulfilmentLabel}\n\n${orderSummary}\n\n*Total: R${total.toFixed(2)}*\n\nCan you fulfil this order?`,
      [
        { id: 'accept', title: '✅ Accept' },
        { id: 'reject', title: '❌ Decline' },
      ]
    );
  } else {
    logger.warn('No WhatsApp number for vendor; auto-confirming order', {
      vendorId: vendor.id,
    });
    // Auto-confirm if vendor has no WhatsApp number configured
    await orderService.updateOrderStatus(order.id, 'confirmed');
    await sessionService.updateSession(from, {
      state: SESSION_STATES.ORDER_PLACED,
    });
    await whatsappService.sendTextMessage(
      from,
      `✅ *Order Confirmed!*\n\nOrder #${order.id.slice(-8).toUpperCase()}\nTotal: R${total.toFixed(2)}${deliveryMsg}\n\nWe'll notify you when it's ready! 🎉`
    );
  }
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
