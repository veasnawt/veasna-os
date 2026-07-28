import * as react from 'react';
import { SVGProps } from 'react';

interface IconProps extends SVGProps<SVGSVGElement> {
    /**
     * Icon size in pixels.
     * @default 24
     */
    size?: number;
    /**
     * Stroke width.
     * @default 2
     */
    strokeWidth?: number;
}

declare function Add({ size, strokeWidth, ...props }: IconProps): react.JSX.Element;

declare function Create({ size, strokeWidth, ...props }: IconProps): react.JSX.Element;

declare function Delete({ size, strokeWidth, ...props }: IconProps): react.JSX.Element;

declare function Publish({ size, strokeWidth, ...props }: IconProps): react.JSX.Element;

declare function Document({ size, strokeWidth, ...props }: IconProps): react.JSX.Element;

declare function Folder({ size, strokeWidth, ...props }: IconProps): react.JSX.Element;

declare function Art({ size, strokeWidth, ...props }: IconProps): react.JSX.Element;

declare function Game({ size, strokeWidth, ...props }: IconProps): react.JSX.Element;

declare function Music({ size, strokeWidth, ...props }: IconProps): react.JSX.Element;

declare function Home({ size, strokeWidth, ...props }: IconProps): react.JSX.Element;

declare function Search({ size, strokeWidth, ...props }: IconProps): react.JSX.Element;

declare function Check({ size, strokeWidth, ...props }: IconProps): react.JSX.Element;

declare function Code({ size, strokeWidth, ...props }: IconProps): react.JSX.Element;

declare function Favorite({ size, strokeWidth, ...props }: IconProps): react.JSX.Element;

declare function Globe({ size, strokeWidth, ...props }: IconProps): react.JSX.Element;

declare function Idea({ size, strokeWidth, ...props }: IconProps): react.JSX.Element;

declare function Star({ size, strokeWidth, ...props }: IconProps): react.JSX.Element;

declare function Ai({ size, strokeWidth, ...props }: IconProps): react.JSX.Element;

declare function Notification({ size, strokeWidth, ...props }: IconProps): react.JSX.Element;

declare function Settings({ size, strokeWidth, ...props }: IconProps): react.JSX.Element;

declare function User({ size, strokeWidth, ...props }: IconProps): react.JSX.Element;

export { Add, Ai, Art, Check, Code, Create, Delete, Document, Favorite, Folder, Game, Globe, Home, type IconProps, Idea, Music, Notification, Publish, Search, Settings, Star, User };
