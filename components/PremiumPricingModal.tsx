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
      "Token AI Unlimited (Tanpa batas 100k)",
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
    window.open(`https://wa.me/62881026038318?text=${msg}`, "_blank");
  };

  if (!isVisible) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0, 5, 16, 0.82)",
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
          background: rgba(14, 28, 54, 0.65);
          border: 1px solid rgba(149, 199, 255, 0.15);
          border-radius: 18px;
          padding: 22px 20px;
          position: relative;
          transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
          text-align: left;
          flex: 1;
          min-width: 260px;
          backdrop-filter: blur(12px);
        }
        .pricing-card:hover {
          transform: translateY(-5px);
          border-color: rgba(56, 189, 248, 0.45);
          background: rgba(14, 28, 54, 0.9);
          box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5), 0 0 24px rgba(56, 189, 248, 0.2);
        }
        .pricing-card--popular {
          border-color: rgba(129, 140, 248, 0.5);
          background: linear-gradient(175deg, rgba(30, 41, 88, 0.85) 0%, rgba(14, 23, 54, 0.75) 100%);
          box-shadow: 0 10px 30px rgba(129, 140, 248, 0.2);
        }
        .pricing-card--popular:hover {
          border-color: rgba(129, 140, 248, 0.8);
          box-shadow: 0 20px 48px rgba(0, 0, 0, 0.6), 0 0 32px rgba(129, 140, 248, 0.35);
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
          background: linear-gradient(135deg, #0ea5e9, #0284c7);
          color: #ffffff;
          box-shadow: 0 4px 16px rgba(14, 165, 233, 0.35);
        }
        .buy-btn--default:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(14, 165, 233, 0.55);
          background: linear-gradient(135deg, #38bdf8, #0ea5e9);
        }
        .buy-btn--popular {
          background: linear-gradient(135deg, #6366f1, #4f46e5);
          color: #ffffff;
          box-shadow: 0 4px 18px rgba(99, 102, 241, 0.45);
        }
        .buy-btn--popular:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(99, 102, 241, 0.65);
          background: linear-gradient(135deg, #818cf8, #6366f1);
        }
        .buy-btn--yearly {
          background: linear-gradient(135deg, #10b981, #059669);
          color: #ffffff;
          box-shadow: 0 4px 18px rgba(16, 185, 129, 0.35);
        }
        .buy-btn--yearly:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(16, 185, 129, 0.55);
          background: linear-gradient(135deg, #34d399, #10b981);
        }

        .close-btn {
          position: absolute;
          top: 18px;
          right: 18px;
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255, 255, 255, 0.6);
          cursor: pointer;
          transition: all 0.16s;
          font-family: inherit;
        }
        .close-btn:hover {
          background: rgba(239, 68, 68, 0.18);
          border-color: rgba(239, 68, 68, 0.4);
          color: #fca5a5;
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
          background: "linear-gradient(165deg, rgba(6, 18, 42, 0.95) 0%, rgba(2, 8, 24, 0.98) 100%)",
          border: "1px solid rgba(56, 189, 248, 0.22)",
          borderRadius: "24px",
          boxShadow: "0 25px 70px rgba(0, 0, 0, 0.7), 0 0 40px rgba(14, 165, 233, 0.15)",
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
              background: "rgba(56, 189, 248, 0.12)",
              border: "1px solid rgba(56, 189, 248, 0.3)",
              color: "#38bdf8",
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
              color: "#f0f8ff",
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
              color: "rgba(255, 255, 255, 0.6)",
              maxWidth: "560px",
              margin: "0 auto",
              lineHeight: 1.6,
            }}
          >
            User biasa dibatasi 100k token/hari. Dapatkan <strong style={{ color: "#38bdf8" }}>Token AI Unlimited</strong> tanpa batasan kuota untuk seluruh fitur kreator Stock AI Studio.
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
                          background: isPop ? "rgba(129, 140, 248, 0.25)" : "rgba(52, 211, 153, 0.25)",
                          border: `1px solid ${isPop ? "rgba(129, 140, 248, 0.5)" : "rgba(52, 211, 153, 0.5)"}`,
                          color: isPop ? "#c7d2fe" : "#a7f3d0",
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

                  <div style={{ fontSize: "18px", fontWeight: 800, color: "#f0f8ff", marginBottom: "8px" }}>
                    {plan.title}
                  </div>

                  <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginBottom: "4px" }}>
                    <span style={{ fontSize: "28px", fontWeight: 900, color: "#ffffff", letterSpacing: "-0.03em" }}>
                      {plan.price}
                    </span>
                    <span style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.45)", fontWeight: 600 }}>
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
                <div style={{ marginTop: "4px", paddingTop: "14px", borderTop: "1px solid rgba(255, 255, 255, 0.08)" }}>
                  <div style={{ fontSize: "11px", fontWeight: 800, color: "rgba(255, 255, 255, 0.5)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>
                    Keuntungan Paket:
                  </div>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                    {plan.benefits.map((b, i) => (
                      <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "12px", color: "#e2e8f0", lineHeight: 1.45 }}>
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
              background: "rgba(14, 165, 233, 0.08)",
              border: "1px solid rgba(56, 189, 248, 0.3)",
              borderRadius: "16px",
              marginBottom: "20px",
              animation: "modalCardIn 0.25s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <div style={{ fontSize: "15px", fontWeight: 800, color: "#f0f8ff" }}>
                  Konfirmasi Pembelian: {selectedPlan.title} ({selectedPlan.price})
                </div>
                <div style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.6)", marginTop: "2px" }}>
                  Aktivasi instan melalui WhatsApp Admin atau QRIS / Transfer Bank
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCheckout(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(255, 255, 255, 0.5)",
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
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  borderRadius: "10px",
                  color: "#f0f8ff",
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
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.07)",
            borderRadius: "12px",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11.5px", color: "rgba(255, 255, 255, 0.5)" }}>
            <Shield size={14} color="#38bdf8" />
            <span>Garansi aktivasi instan 100% aman langsung aktif di akun Anda.</span>
          </div>

          <button
            type="button"
            onClick={() => handleContactAdmin(PRICING_PLANS[1])}
            style={{
              background: "transparent",
              border: "none",
              color: "#38bdf8",
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
