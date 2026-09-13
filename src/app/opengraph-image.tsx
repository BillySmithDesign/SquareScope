import { ImageResponse } from "next/og";

export const alt =
  "SquareScope — Open-source business intelligence for Square merchants";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background:
            "linear-gradient(135deg, #07101f 0%, #10172d 55%, #293c87 100%)",
          color: "white",
          padding: "72px",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            width: "72%",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 82,
              fontWeight: 800,
              letterSpacing: "-4px",
            }}
          >
            SquareScope
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 25,
              letterSpacing: "7px",
              marginTop: 12,
              opacity: 0.72,
            }}
          >
            OPEN SOURCE BUSINESS INTELLIGENCE
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 38,
              marginTop: 56,
              lineHeight: 1.25,
              opacity: 0.95,
            }}
          >
            Turn your Square data into real business insights.
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 22,
              marginTop: 24,
              opacity: 0.65,
            }}
          >
            Sales · Customers · Products & Services · Bookings · Growth
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 22,
            position: "absolute",
            right: 90,
            bottom: 120,
          }}
        >
          {[110, 180, 265].map((height, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                width: 62,
                height,
                borderRadius: 22,
                background:
                  "linear-gradient(180deg, #35b8ff 0%, #4c63ff 55%, #7c3cff 100%)",
                boxShadow:
                  "0 0 50px rgba(71,110,255,.35)",
              }}
            />
          ))}
        </div>
      </div>
    ),
    size
  );
}
