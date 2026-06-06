import React from "react";

interface ChatErrorCardProps {
  message?: string;
  isPremiumModel?: boolean;
  onSwitchModel?: () => void;
}

const ChatErrorCard: React.FC<ChatErrorCardProps> = ({ message, isPremiumModel, onSwitchModel }) => (
  <div className="chat-error-card">
    <div className="chat-error-card__icon" aria-hidden="true">🚦</div>
    <div className="chat-error-card__content">
      <strong>{isPremiumModel ? "Premium Quota Exceeded" : "Quota Exceeded"}</strong>
      <div className="mt-1">
        {isPremiumModel ? (
          <>
            You have exceeded your premium model allowance.<br />
            <span>Do you want to switch this conversation to a standard model?</span>
            <div className="mt-3">
              <button
                type="button"
                className="px-3 py-1 rounded bg-copilot-purple text-white hover:bg-copilot-purple/80 transition-colors"
                onClick={onSwitchModel}
              >
                Switch to Standard Model
              </button>
            </div>
          </>
        ) : (
          message || "You have reached the usage limit for this service. Please wait and try again later, or contact support if this persists."
        )}
      </div>
    </div>
  </div>
);

export default ChatErrorCard;
