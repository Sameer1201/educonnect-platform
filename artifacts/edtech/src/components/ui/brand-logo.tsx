import { APP_ICON_PATH, APP_NAME } from "@/lib/brand";

type BrandLogoProps = {
  className?: string;
  imageClassName?: string;
  labelClassName?: string;
  showLabel?: boolean;
  variant?: "icon" | "wordmark";
};

export function BrandLogo({
  className = "",
  imageClassName = "",
  labelClassName = "",
  showLabel = false,
  variant = "wordmark",
}: BrandLogoProps) {
  if (variant === "icon") {
    return (
      <div className={`flex items-center gap-3 ${className}`.trim()}>
        <div className="flex h-12 w-12 items-center justify-center rounded-[20px] bg-[radial-gradient(circle_at_top,_rgba(255,170,72,0.18),_transparent_54%),radial-gradient(circle_at_bottom_left,_rgba(37,99,235,0.16),_transparent_52%)] shadow-[0_10px_28px_rgba(15,23,42,0.08)]">
          <img
            src={APP_ICON_PATH}
            alt={`${APP_NAME} icon`}
            loading="eager"
            decoding="async"
            className={`h-11 w-11 object-contain drop-shadow-[0_6px_14px_rgba(37,99,235,0.14)] ${imageClassName}`.trim()}
          />
        </div>
        {showLabel ? (
          <span className={`text-lg font-black tracking-tight text-[#111827] ${labelClassName}`.trim()}>{APP_NAME}</span>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3.5 ${className}`.trim()}>
      <div className="flex h-14 w-14 items-center justify-center rounded-[22px] bg-[radial-gradient(circle_at_top,_rgba(255,170,72,0.2),_transparent_54%),radial-gradient(circle_at_bottom_left,_rgba(37,99,235,0.18),_transparent_52%)] shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <img
          src={APP_ICON_PATH}
          alt={`${APP_NAME} icon`}
          loading="eager"
          decoding="async"
          className={`h-12 w-12 object-contain drop-shadow-[0_8px_18px_rgba(37,99,235,0.14)] ${imageClassName}`.trim()}
        />
      </div>
      <div className={`leading-[0.94] ${labelClassName}`.trim()}>
        <span className="text-[1.65rem] font-black tracking-[-0.05em] text-[#233B7A] sm:text-[1.9rem]">Rank</span>
        <span className="text-[1.65rem] font-black tracking-[-0.05em] text-[#FF8A1F] sm:text-[1.9rem]">Pulse</span>
      </div>
      {showLabel ? <span className="sr-only">{APP_NAME}</span> : null}
    </div>
  );
}
