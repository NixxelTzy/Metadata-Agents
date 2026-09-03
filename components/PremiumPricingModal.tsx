"use client";

import { useEffect, useState } from "react";
import {
  X, Zap, Check, Crown, Sparkles, Shield, ArrowRight,
  Clock, Flame, HelpCircle, MessageCircle, CreditCard
} from "lucide-react";

interface PricingPlan {
  id: "7days" | "30days" | "1year";
  title: string;
  duration: string;
  price: string;
  rawPrice: number;
  periodText: string;
  badge?: string;
  isPopular?: boolean;
  color: string;
  glowColor: string;
  benefits: string[];
  waText: string;
}

const PRICING_PLANS: PricingPlan[] = [
  {
    id: "7days",
    title: "Paket 7 Hari",
    duration: "7 Hari Penuh",
    price: "Rp 5.000",
    rawPrice: 5000,
    periodText: "/ 7 Hari",
    color: "#38bdf8",
    glowColor: "rgba(56, 189, 248, 0.25)",
    benefits: [
      "Token AI Unlimited (Tanpa batas harian 200k)",
      "Akses penuh semua 8 AI tools & features",
      "Proses generasi metadata & upscale cepat",
      "Export format CSV & Adobe Stock siap pakai",
      "Aktif 7 hari penuh sejak aktivasi",
    ],
    waText: "Halo Admin, saya ingin membeli Paket Premium 7 Hari (Rp 5.000) untuk akun saya.",
  },
  {
    id: "30days",
    title: "Paket 30 Hari",
    duration: "30 Hari (1 Bulan)",
    price: "Rp 20.000",
    rawPrice: 20000,
    periodText: "/ Bulan",
    badge: "Paling Populer",
    isPopular: true,
    color: "#818cf8",
    glowColor: "rgba(129, 140, 248, 0.35)",
    benefits: [
      "Token AI Unlimited 30 hari tanpa kuota",
      "Prioritas kecepatan server AI (High Speed)",
      "Bebas generate ribuan metadata gambar",
      "Akses penuh AI Vector, Motion Studio & Chat",
      "Dukungan prioritas & hemat biaya",
    ],
    waText: "Halo Admin, saya ingin membeli Paket Premium 30 Hari (Rp 20.000) untuk akun saya.",
  },
  {
    id: "1year",
    title: "Paket 1 Tahun",
    duration: "365 Hari (12 Bulan)",
    price: "Rp 80.000",
    rawPrice: 80000,
    periodText: "/ Tahun",
    badge: "Paling Hemat",
    color: "#34d399",
    glowColor: "rgba(52, 211, 153, 0.35)",
    benefits: [
      "Token AI Unlimited selama 1 tahun penuh",
      "Biaya termurah (Hanya ~Rp 6.600 / bulan)",
      "Akses semua fitur baru & update mendatang",
      "Akses VIP & batch processing maksimal",
      "Dukungan langsung via email & WhatsApp",
    ],
    waText: "Halo Admin, saya ingin membeli Paket Premium 1 Tahun (Rp 80.000) untuk akun saya.",
  },
];

interface Props {
  isOpen?: boolean;
  onClose?: () => void;
  userEmail?: string;
  username?: string;
}

export default function PremiumPricingModal({ isOpen: controlledIsOpen, onClose, userEmail, username }: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);

  const isVisible = controlledIsOpen !== undefined ? controlledIsOpen : internalOpen;

  useEffect(() => {
    const handleOpen = () => setInternalOpen(true);
    window.addEventListener("open_premium_pricing_modal", handleOpen);
    return () => window.removeEventListener("open_premium_pricing_modal", handleOpen);
  }, []);

  const handleClose = () => {
    setInternalOpen(false);
    setShowCheckout(false);
    setSelectedPlan(null);
    if (onClose) onClose();
  };

  const handleSelectPlan = (plan: PricingPlan) => {
    setSelectedPlan(plan);
    setShowCheckout(true);
  };

  const handleContactAdmin = (plan: PricingPlan) => {
    const emailInfo = userEmail ? ` (Email: ${userEmail})` : "";
    const msg = encodeURIComponent(`${plan.waText}${emailInfo}`);
    window.open(`https://wa.me/6282343769190?text=${msg}`, "_blank");
  };

  if (!isVisible) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(15, 23, 42, 0.45)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        overflowY: "auto",
        animation: "modalBackdropIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <style>{`
        @keyframes modalBackdropIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes modalCardIn {
          from { opacity: 0; transform: scale(0.95) translateY(14px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes planHoverGlow {
          0%, 100% { box-shadow: 0 0 20px rgba(56,189,248,0.15); }
          50%      { box-shadow: 0 0 35px rgba(56,189,248,0.3); }
        }

        .pricing-card {
          display: flex;
          flex-direction: column;
          background: rgba(255, 255, 255, 0.8);
          border: 1px solid rgba(147, 197, 253, 0.45);
          border-radius: 18px;
          padding: 22px 20px;
          position: relative;
          transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
          text-align: left;
          flex: 1;
          min-width: 260px;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          box-shadow: 0 4px 16px rgba(59, 130, 246, 0.08);
        }
        .pricing-card:hover {
          transform: translateY(-5px);
          border-color: rgba(59, 130, 246, 0.6);
          background: rgba(255, 255, 255, 0.95);
          box-shadow: 0 16px 36px rgba(59, 130, 246, 0.16);
        }
        .pricing-card--popular {
          border-color: rgba(129, 140, 248, 0.6);
          background: linear-gradient(175deg, rgba(238, 242, 255, 0.9) 0%, rgba(255, 255, 255, 0.9) 100%);
          box-shadow: 0 10px 30px rgba(129, 140, 248, 0.15);
        }
        .pricing-card--popular:hover {
          border-color: rgba(99, 102, 241, 0.8);
          box-shadow: 0 20px 48px rgba(99, 102, 241, 0.22);
        }

        .buy-btn {
          width: 100%;
          padding: 12px 18px;
          border-radius: 12px;
          border: none;
          font-weight: 800;
          font-size: 13.5px;
          cursor: pointer;
          transition: all 0.18s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-family: inherit;
          margin: 16px 0;
        }
        .buy-btn--default {
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          color: #ffffff;
          box-shadow: 0 4px 16px rgba(59, 130, 246, 0.35);
        }
        .buy-btn--default:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(59, 130, 246, 0.45);
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
        }
        .buy-btn--popular {
          background: linear-gradient(135deg, #6366f1, #4f46e5);
          color: #ffffff;
          box-shadow: 0 4px 18px rgba(99, 102, 241, 0.45);
        }
        .buy-btn--popular:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(99, 102, 241, 0.65);
          background: linear-gradient(135deg, #4f46e5, #4338ca);
        }
        .buy-btn--yearly {
          background: linear-gradient(135deg, #10b981, #059669);
          color: #ffffff;
          box-shadow: 0 4px 18px rgba(16, 185, 129, 0.35);
        }
        .buy-btn--yearly:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(16, 185, 129, 0.55);
          background: linear-gradient(135deg, #059669, #047857);
        }

        .close-btn {
          position: absolute;
          top: 18px;
          right: 18px;
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: rgba(219, 234, 254, 0.6);
          border: 1px solid rgba(147, 197, 253, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #1e40af;
          cursor: pointer;
          transition: all 0.16s;
          font-family: inherit;
        }
        .close-btn:hover {
          background: rgba(254, 226, 226, 0.8);
          border-color: rgba(252, 165, 165, 0.8);
          color: #dc2626;
          transform: rotate(90deg);
        }

        @media (max-width: 860px) {
          .pricing-grid {
            flex-direction: column !important;
          }
          .pricing-card {
            width: 100% !important;
          }
        }
      `}</style>

      {/* Main Centered Panel */}
      <div
        style={{
          position: "relative",
          maxWidth: "980px",
          width: "100%",
          background: "linear-gradient(165deg, rgba(255, 255, 255, 0.95) 0%, rgba(240, 247, 255, 0.98) 100%)",
          border: "1px solid rgba(147, 197, 253, 0.55)",
          borderRadius: "24px",
          boxShadow: "0 25px 70px rgba(59, 130, 246, 0.2), 0 0 40px rgba(59, 130, 246, 0.1)",
          padding: "clamp(24px, 4vw, 36px)",
          animation: "modalCardIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          maxHeight: "92vh",
          overflowY: "auto",
        }}
      >
        {/* Close Button X */}
        <button
          type="button"
          className="close-btn"
          onClick={handleClose}
          aria-label="Tutup Panel"
          title="Tutup (Esc)"
        >
          <X size={18} />
        </button>

        {/* Modal Header */}
        <div style={{ textAlign: "center", marginBottom: "28px", paddingRight: "30px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 14px",
              borderRadius: "999px",
              background: "rgba(219, 234, 254, 0.7)",
              border: "1px solid rgba(147, 197, 253, 0.5)",
              color: "#1e40af",
              fontSize: "11px",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: "12px",
            }}
          >
            <Crown size={13} />
            <span>Akses Premium AI Unlimited</span>
          </div>

          <h2
            style={{
              fontSize: "clamp(20px, 3.5vw, 28px)",
              fontWeight: 900,
              color: "#0f172a",
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
              marginBottom: "8px",
            }}
          >
            Pilih Paket Langganan Premium
          </h2>

          <p
            style={{
              fontSize: "13px",
              color: "#64748b",
              maxWidth: "560px",
              margin: "0 auto",
              lineHeight: 1.6,
            }}
          >
            User biasa dibatasi 100k token/hari. Dapatkan <strong style={{ color: "#2563eb" }}>Token AI Unlimited</strong> tanpa batasan kuota untuk seluruh fitur kreator Stock AI Studio.
          </p>
        </div>

        {/* 3 Pricing Cards Grid */}
        <div
          className="pricing-grid"
          style={{
            display: "flex",
            gap: "16px",
            alignItems: "stretch",
            justifyContent: "center",
            marginBottom: "24px",
          }}
        >
          {PRICING_PLANS.map((plan) => {
            const isPop = plan.isPopular;
            const isYear = plan.id === "1year";
            return (
              <div
                key={plan.id}
                className={`pricing-card${isPop ? " pricing-card--popular" : ""}`}
              >
                {/* ── BAGIAN ATAS: Type & Harga ── */}
                <div>
                  {plan.badge && (
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "8px" }}>
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: 800,
                          padding: "3px 9px",
                          borderRadius: "999px",
                          background: isPop ? "rgba(224, 231, 255, 0.9)" : "rgba(209, 250, 229, 0.9)",
                          border: `1px solid ${isPop ? "rgba(129, 140, 248, 0.6)" : "rgba(52, 211, 153, 0.6)"}`,
                          color: isPop ? "#3730a3" : "#065f46",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {plan.badge}
                      </span>
                    </div>
                  )}

                  <div style={{ fontSize: "12px", fontWeight: 700, color: plan.color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>
                    {plan.duration}
                  </div>

                  <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a", marginBottom: "8px" }}>
                    {plan.title}
                  </div>

                  <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginBottom: "4px" }}>
                    <span style={{ fontSize: "28px", fontWeight: 900, color: "#0f172a", letterSpacing: "-0.03em" }}>
                      {plan.price}
                    </span>
                    <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>
                      {plan.periodText}
                    </span>
                  </div>
                </div>

                {/* ── BAGIAN TENGAH: Button Beli ── */}
                <button
                  type="button"
                  className={`buy-btn ${isPop ? "buy-btn--popular" : isYear ? "buy-btn--yearly" : "buy-btn--default"}`}
                  onClick={() => handleSelectPlan(plan)}
                >
                  <Zap size={15} />
                  <span>Beli {plan.title}</span>
                  <ArrowRight size={14} />
                </button>

                {/* ── BAGIAN BAWAH: Keuntungan ── */}
                <div style={{ marginTop: "4px", paddingTop: "14px", borderTop: "1px solid rgba(147, 197, 253, 0.3)" }}>
                  <div style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>
                    Keuntungan Paket:
                  </div>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                    {plan.benefits.map((b, i) => (
                      <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "12px", color: "#334155", lineHeight: 1.45 }}>
                        <span
                          style={{
                            width: "16px",
                            height: "16px",
                            borderRadius: "50%",
                            background: `${plan.color}22`,
                            border: `1px solid ${plan.color}55`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            marginTop: "1px",
                          }}
                        >
                          <Check size={10} color={plan.color} strokeWidth={3} />
                        </span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>

        {/* Checkout / Payment Method Drawer */}
        {showCheckout && selectedPlan && (
          <div
            style={{
              padding: "20px 24px",
              background: "rgba(219, 234, 254, 0.7)",
              border: "1px solid rgba(147, 197, 253, 0.6)",
              borderRadius: "16px",
              marginBottom: "20px",
              animation: "modalCardIn 0.25s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a" }}>
                  Konfirmasi Pembelian: {selectedPlan.title} ({selectedPlan.price})
                </div>
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                  Aktivasi instan melalui WhatsApp Admin atau QRIS / Transfer Bank
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCheckout(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#2563eb",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: 700,
                }}
              >
                Ganti Paket
              </button>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => handleContactAdmin(selectedPlan)}
                style={{
                  flex: 1,
                  minWidth: "220px",
                  padding: "12px 18px",
                  background: "#22c55e",
                  border: "none",
                  borderRadius: "10px",
                  color: "#ffffff",
                  fontWeight: 800,
                  fontSize: "13px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  boxShadow: "0 4px 16px rgba(34, 197, 94, 0.35)",
                }}
              >
                <MessageCircle size={16} />
                <span>Beli via WhatsApp Admin (Cepat)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  alert(`Silakan hubungi WhatsApp Admin untuk transfer otomatis atau QRIS.\nPaket: ${selectedPlan.title} (${selectedPlan.price})\nAkun Email: ${userEmail || "Tamu"}`);
                  handleContactAdmin(selectedPlan);
                }}
                style={{
                  padding: "12px 18px",
                  background: "rgba(255, 255, 255, 0.8)",
                  border: "1px solid rgba(147, 197, 253, 0.5)",
                  borderRadius: "10px",
                  color: "#1e40af",
                  fontWeight: 700,
                  fontSize: "13px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <CreditCard size={15} />
                <span>QRIS &amp; Transfer</span>
              </button>
            </div>
          </div>
        )}

        {/* Bottom Safety & Support Note */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            background: "rgba(255, 255, 255, 0.6)",
            border: "1px solid rgba(147, 197, 253, 0.4)",
            borderRadius: "12px",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11.5px", color: "#64748b" }}>
            <Shield size={14} color="#2563eb" />
            <span>Garansi aktivasi instan 100% aman langsung aktif di akun Anda.</span>
          </div>

          <button
            type="button"
            onClick={() => handleContactAdmin(PRICING_PLANS[1])}
            style={{
              background: "transparent",
              border: "none",
              color: "#2563eb",
              fontSize: "11.5px",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontFamily: "inherit",
            }}
          >
            <HelpCircle size={13} />
            <span>Ada Pertanyaan? Chat Admin</span>
          </button>
        </div>
      </div>
    </div>
  );
}
