// frontend/src/components/SharedLayout.tsx
/**
 * Shared Layout Component.
 * 
 * Wraps feature pages with the Workspace Drawer.
 * Adjusts content area to account for drawer width.
 */

import React, { useState } from "react";
import WorkspaceDrawer from "./WorkspaceDrawer";

interface SharedLayoutProps {
  children: React.ReactNode;
  showDrawer?: boolean;
}

export default function SharedLayout({ children, showDrawer = true }: SharedLayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(true);

  const toggleDrawer = () => setDrawerOpen(!drawerOpen);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
      }}
    >
      {/* Main Content */}
      <div
        style={{
          flex: 1,
          marginRight: showDrawer && drawerOpen ? 280 : 0,
          transition: "margin-right 0.2s ease",
        }}
      >
        {children}
      </div>

      {/* Workspace Drawer */}
      {showDrawer && (
        <WorkspaceDrawer
          isOpen={drawerOpen}
          onToggle={toggleDrawer}
        />
      )}
    </div>
  );
}
