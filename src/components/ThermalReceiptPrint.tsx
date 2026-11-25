import React from 'react';
import type { Order } from '../types';
import { SUPPORT_PHONE_DISPLAY, formatPriceUSD } from '../lib/utils';

interface ThermalReceiptPrintProps {
  order: Order | null;
}

export const ThermalReceiptPrint: React.FC<ThermalReceiptPrintProps> = ({ order }) => {
  if (!order) {
    return <div id="printable-receipt-container" aria-hidden="true" />;
  }

  return (
    <div id="printable-receipt-container">
      <div style={{ textAlign: 'center', marginBottom: '8px', borderBottom: '1px dashed #000', paddingBottom: '6px' }}>
        <div style={{ fontSize: '15px', fontWeight: 'bold', letterSpacing: '1px' }}>
          DR - PREMIUM RESIN
        </div>
        <div style={{ fontSize: '10px' }}>Handcrafted Wood &amp; Epoxy Atelier</div>
        <div style={{ fontSize: '10px' }}>Support: {SUPPORT_PHONE_DISPLAY}</div>
      </div>

      <div style={{ marginBottom: '6px', fontSize: '11px' }}>
        <div>
          <strong>Order:</strong> {order.orderCode}
        </div>
        <div>
          <strong>Date:</strong> {new Date(order.createdAt).toLocaleString()}
        </div>
        <div>
          <strong>Status:</strong> {order.status}
        </div>
      </div>

      <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '5px 0', marginBottom: '6px' }}>
        <div>
          <strong>Customer:</strong> {order.customerName}
        </div>
        <div>
          <strong>Phone:</strong> {order.customerPhone}
        </div>
        <div>
          <strong>Address:</strong> {order.deliveryAddress}
        </div>
        {order.deliveryNotes && (
          <div>
            <strong>Notes:</strong> {order.deliveryNotes}
          </div>
        )}
      </div>

      <div style={{ marginBottom: '6px' }}>
        <div>
          <strong>Payment:</strong> {order.paymentMethod}
        </div>
        {order.senderWalletPhone && (
          <div>
            <strong>Wallet:</strong> {order.senderWalletPhone}
          </div>
        )}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: '1px dashed #000', borderBottom: '1px dashed #000', marginBottom: '6px' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '3px 0' }}>Item</th>
            <th style={{ textAlign: 'center', padding: '3px 0' }}>Qty</th>
            <th style={{ textAlign: 'right', padding: '3px 0' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, idx) => (
            <tr key={idx}>
              <td style={{ padding: '2px 0' }}>{item.name}</td>
              <td style={{ textAlign: 'center', padding: '2px 0' }}>{item.quantity}</td>
              <td style={{ textAlign: 'right', padding: '2px 0' }}>{formatPriceUSD(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ fontSize: '11px', marginBottom: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Subtotal:</span>
          <span>{formatPriceUSD(order.subtotal)} USD</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Delivery Fee:</span>
          <span>{formatPriceUSD(order.deliveryFee)} USD</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '13px', marginTop: '4px', borderTop: '1px solid #000', paddingTop: '4px' }}>
          <span>GRAND TOTAL:</span>
          <span>{formatPriceUSD(order.grandTotal)} USD</span>
        </div>
      </div>

      <div style={{ textAlign: 'center', fontSize: '10px', borderTop: '1px dashed #000', paddingTop: '6px' }}>
        <div>Thank you for choosing DR Resin</div>
        <div>Customer Care: {SUPPORT_PHONE_DISPLAY}</div>
      </div>
    </div>
  );
};
