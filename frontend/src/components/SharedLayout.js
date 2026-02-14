import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// frontend/src/components/SharedLayout.tsx
/**
 * Shared Layout Component.
 *
 * Wraps feature pages with the Workspace Drawer.
 * Adjusts content area to account for drawer width.
 */
import { useState } from "react";
import WorkspaceDrawer from "./WorkspaceDrawer";
export default function SharedLayout({ children, showDrawer = true }) {
    const [drawerOpen, setDrawerOpen] = useState(true);
    const toggleDrawer = () => setDrawerOpen(!drawerOpen);
    return (_jsxs("div", { style: {
            minHeight: "100vh",
            display: "flex",
        }, children: [_jsx("div", { style: {
                    flex: 1,
                    marginRight: showDrawer && drawerOpen ? 280 : 0,
                    transition: "margin-right 0.2s ease",
                }, children: children }), showDrawer && (_jsx(WorkspaceDrawer, { isOpen: drawerOpen, onToggle: toggleDrawer }))] }));
}
