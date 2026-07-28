// src/actions/Add.tsx
import { jsx } from "react/jsx-runtime";
function Add({
  size = 24,
  strokeWidth = 2,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ...props,
      children: /* @__PURE__ */ jsx("path", { d: "M12 6v12m-6-6h12" })
    }
  );
}

// src/actions/Create.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function Create({
  size = 24,
  strokeWidth = 2,
  ...props
}) {
  return /* @__PURE__ */ jsx2(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ...props,
      children: /* @__PURE__ */ jsx2("path", { d: "M12 5v4m0 6v4m-7-7h4m6 0h4M9.5 9.5l5 5m0-5-5 5" })
    }
  );
}

// src/actions/Delete.tsx
import { jsx as jsx3 } from "react/jsx-runtime";
function Delete({
  size = 24,
  strokeWidth = 2,
  ...props
}) {
  return /* @__PURE__ */ jsx3(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ...props,
      children: /* @__PURE__ */ jsx3("path", { d: "M8 6h8m-6-3h4M6 6l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13m-8 4v6m4-6v6" })
    }
  );
}

// src/actions/Publish.tsx
import { jsx as jsx4 } from "react/jsx-runtime";
function Publish({
  size = 24,
  strokeWidth = 2,
  ...props
}) {
  return /* @__PURE__ */ jsx4(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ...props,
      children: /* @__PURE__ */ jsx4("path", { d: "M20 4 4.8 10.4a1 1 0 0 0 .1 1.9l5.8 1.9 1.9 5.8a1 1 0 0 0 1.9.1zm-9.3 10.2L20 4" })
    }
  );
}

// src/files/Document.tsx
import { jsx as jsx5, jsxs } from "react/jsx-runtime";
function Document({
  size = 24,
  strokeWidth = 2,
  ...props
}) {
  return /* @__PURE__ */ jsxs(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ...props,
      children: [
        /* @__PURE__ */ jsx5("path", { d: "M8 3h6.6L19 7.4V19a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2" }),
        /* @__PURE__ */ jsx5("path", { d: "M14.5 3v4.5H19" })
      ]
    }
  );
}

// src/files/Folder.tsx
import { jsx as jsx6 } from "react/jsx-runtime";
function Folder({
  size = 24,
  strokeWidth = 2,
  ...props
}) {
  return /* @__PURE__ */ jsx6(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ...props,
      children: /* @__PURE__ */ jsx6("path", { d: "M3 8.5A2.5 2.5 0 0 1 5.5 6H9l2 2h7.5a2.5 2.5 0 0 1 2.5 2.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5zM3 10h18" })
    }
  );
}

// src/media/Art.tsx
import { jsx as jsx7, jsxs as jsxs2 } from "react/jsx-runtime";
function Art({
  size = 24,
  strokeWidth = 2,
  ...props
}) {
  return /* @__PURE__ */ jsxs2(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ...props,
      children: [
        /* @__PURE__ */ jsx7("path", { d: "M12 3c-5 0-9 3.8-9 8.5S7 20 12 20h1.2a2.3 2.3 0 0 0 0-4.6H12a2 2 0 0 1-2-2c0-1.1.9-2 2-2h6a3 3 0 0 0 3-3C21 5.5 17 3 12 3" }),
        /* @__PURE__ */ jsx7("circle", { cx: "8", cy: "8.5", r: ".5" }),
        /* @__PURE__ */ jsx7("circle", { cx: "11", cy: "6.8", r: ".5" }),
        /* @__PURE__ */ jsx7("circle", { cx: "7", cy: "12", r: ".5" })
      ]
    }
  );
}

// src/media/Game.tsx
import { jsx as jsx8, jsxs as jsxs3 } from "react/jsx-runtime";
function Game({
  size = 24,
  strokeWidth = 2,
  ...props
}) {
  return /* @__PURE__ */ jsxs3(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ...props,
      children: [
        /* @__PURE__ */ jsx8("path", { d: "M8 9h8a5 5 0 0 1 4.8 6.4l-.6 2a2.5 2.5 0 0 1-3.9 1.3L14 17h-4l-2.3 1.7a2.5 2.5 0 0 1-3.9-1.3l-.6-2A5 5 0 0 1 8 9m0 4v4m-2-2h4" }),
        /* @__PURE__ */ jsx8("circle", { cx: "16.5", cy: "14", r: ".5" }),
        /* @__PURE__ */ jsx8("circle", { cx: "18", cy: "16", r: ".5" })
      ]
    }
  );
}

// src/media/Music.tsx
import { jsx as jsx9, jsxs as jsxs4 } from "react/jsx-runtime";
function Music({
  size = 24,
  strokeWidth = 2,
  ...props
}) {
  return /* @__PURE__ */ jsxs4(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ...props,
      children: [
        /* @__PURE__ */ jsx9("path", { d: "M14 5v10m0-10 5 2" }),
        /* @__PURE__ */ jsx9("circle", { cx: "10", cy: "17", r: "3" })
      ]
    }
  );
}

// src/navigation/Home.tsx
import { jsx as jsx10, jsxs as jsxs5 } from "react/jsx-runtime";
function Home({
  size = 24,
  strokeWidth = 2,
  ...props
}) {
  return /* @__PURE__ */ jsxs5(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ...props,
      children: [
        /* @__PURE__ */ jsx10("path", { d: "M4 10.5 12 4l8 6.5" }),
        /* @__PURE__ */ jsx10("path", { d: "M6 10v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8" }),
        /* @__PURE__ */ jsx10("path", { d: "M10 20v-5a2 2 0 0 1 4 0v5" })
      ]
    }
  );
}

// src/navigation/Search.tsx
import { jsx as jsx11, jsxs as jsxs6 } from "react/jsx-runtime";
function Search({
  size = 24,
  strokeWidth = 2,
  ...props
}) {
  return /* @__PURE__ */ jsxs6(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ...props,
      children: [
        /* @__PURE__ */ jsx11("circle", { cx: "11", cy: "11", r: "6" }),
        /* @__PURE__ */ jsx11("path", { d: "m16 16 5 5" })
      ]
    }
  );
}

// src/status/Check.tsx
import { jsx as jsx12 } from "react/jsx-runtime";
function Check({
  size = 24,
  strokeWidth = 2,
  ...props
}) {
  return /* @__PURE__ */ jsx12(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ...props,
      children: /* @__PURE__ */ jsx12("path", { d: "m5 12.5 5 5 9-9" })
    }
  );
}

// src/symbols/Code.tsx
import { jsx as jsx13 } from "react/jsx-runtime";
function Code({
  size = 24,
  strokeWidth = 2,
  ...props
}) {
  return /* @__PURE__ */ jsx13(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ...props,
      children: /* @__PURE__ */ jsx13("path", { d: "m9 8-4 4 4 4m6-8 4 4-4 4M13.5 6l-3 12" })
    }
  );
}

// src/symbols/Favorite.tsx
import { jsx as jsx14 } from "react/jsx-runtime";
function Favorite({
  size = 24,
  strokeWidth = 2,
  ...props
}) {
  return /* @__PURE__ */ jsx14(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ...props,
      children: /* @__PURE__ */ jsx14("path", { d: "m12 20.5-7.1-7.1A4.5 4.5 0 0 1 11.3 7l.7.7.7-.7a4.5 4.5 0 1 1 6.4 6.4z" })
    }
  );
}

// src/symbols/Globe.tsx
import { jsx as jsx15, jsxs as jsxs7 } from "react/jsx-runtime";
function Globe({
  size = 24,
  strokeWidth = 2,
  ...props
}) {
  return /* @__PURE__ */ jsxs7(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ...props,
      children: [
        /* @__PURE__ */ jsx15("circle", { cx: "12", cy: "12", r: "9" }),
        /* @__PURE__ */ jsx15("path", { d: "M3 12h18m-9-9c2.5 2.3 4 5.6 4 9s-1.5 6.7-4 9m0-18c-2.5 2.3-4 5.6-4 9s1.5 6.7 4 9" })
      ]
    }
  );
}

// src/symbols/Idea.tsx
import { jsx as jsx16 } from "react/jsx-runtime";
function Idea({
  size = 24,
  strokeWidth = 2,
  ...props
}) {
  return /* @__PURE__ */ jsx16(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ...props,
      children: /* @__PURE__ */ jsx16("path", { d: "M9 18h6m-5 3h4m-6-6.5a6 6 0 1 1 8 0V16a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1zM12 8v4m-2-2h4" })
    }
  );
}

// src/symbols/Star.tsx
import { jsx as jsx17 } from "react/jsx-runtime";
function Star({
  size = 24,
  strokeWidth = 2,
  ...props
}) {
  return /* @__PURE__ */ jsx17(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ...props,
      children: /* @__PURE__ */ jsx17("path", { d: "m12 4.5 2.3 4.7 5.2.8-3.8 3.7.9 5.3-4.6-2.3L7.4 19l.9-5.3L4.5 10l5.2-.8z" })
    }
  );
}

// src/system/Ai.tsx
import { jsx as jsx18, jsxs as jsxs8 } from "react/jsx-runtime";
function Ai({
  size = 24,
  strokeWidth = 2,
  ...props
}) {
  return /* @__PURE__ */ jsxs8(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ...props,
      children: [
        /* @__PURE__ */ jsx18("circle", { cx: "12", cy: "12", r: "6" }),
        /* @__PURE__ */ jsx18("path", { d: "M12 6v3m0 6v3m-3-6h3m3 0h3" })
      ]
    }
  );
}

// src/system/Notification.tsx
import { jsx as jsx19 } from "react/jsx-runtime";
function Notification({
  size = 24,
  strokeWidth = 2,
  ...props
}) {
  return /* @__PURE__ */ jsx19(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ...props,
      children: /* @__PURE__ */ jsx19("path", { d: "M18 16H6l1.5-2v-3a4.5 4.5 0 1 1 9 0v3zm-7.5 3a1.5 1.5 0 0 0 3 0" })
    }
  );
}

// src/system/Settings.tsx
import { jsx as jsx20, jsxs as jsxs9 } from "react/jsx-runtime";
function Settings({
  size = 24,
  strokeWidth = 2,
  ...props
}) {
  return /* @__PURE__ */ jsxs9(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ...props,
      children: [
        /* @__PURE__ */ jsx20("path", { d: "M12 3v2m0 14v2m-9-9h2m14 0h2M5.64 5.64l1.41 1.41m9.9 9.9 1.41 1.41m0-12.72-1.41 1.41m-9.9 9.9-1.41 1.41" }),
        /* @__PURE__ */ jsx20("circle", { cx: "12", cy: "12", r: "3" }),
        /* @__PURE__ */ jsx20("circle", { cx: "12", cy: "12", r: "7" })
      ]
    }
  );
}

// src/system/User.tsx
import { jsx as jsx21, jsxs as jsxs10 } from "react/jsx-runtime";
function User({
  size = 24,
  strokeWidth = 2,
  ...props
}) {
  return /* @__PURE__ */ jsxs10(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ...props,
      children: [
        /* @__PURE__ */ jsx21("circle", { cx: "12", cy: "8", r: "3" }),
        /* @__PURE__ */ jsx21("path", { d: "M6 19a6 6 0 0 1 12 0" })
      ]
    }
  );
}
export {
  Add,
  Ai,
  Art,
  Check,
  Code,
  Create,
  Delete,
  Document,
  Favorite,
  Folder,
  Game,
  Globe,
  Home,
  Idea,
  Music,
  Notification,
  Publish,
  Search,
  Settings,
  Star,
  User
};
