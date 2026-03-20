/**
 * Plugin Registry — manages loading, unloading, and accessing market plugins.
 * Central registry that all services use to interact with market data sources.
 */

import { MarketArea } from '@/core/types/common';
import { MarketPlugin, PluginConnectionConfig, PluginStatus } from '@/core/types/plugin';

class PluginRegistry {
  private plugins: Map<string, MarketPlugin> = new Map();

  /** Register a plugin */
  register(plugin: MarketPlugin): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin "${plugin.id}" is already registered.`);
    }
    this.plugins.set(plugin.id, plugin);
  }

  /** Unregister and shut down a plugin */
  async unregister(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;
    await plugin.shutdown();
    this.plugins.delete(pluginId);
  }

  /** Initialize a plugin with connection config */
  async initialize(pluginId: string, config: PluginConnectionConfig): Promise<void> {
    const plugin = this.getPlugin(pluginId);
    await plugin.initialize(config);
  }

  /** Get a specific plugin by ID */
  getPlugin(pluginId: string): MarketPlugin {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin "${pluginId}" not found. Available: ${this.listPluginIds().join(', ')}`);
    }
    return plugin;
  }

  /** Get all plugins for a specific market area */
  getPluginsByArea(area: MarketArea): MarketPlugin[] {
    return Array.from(this.plugins.values()).filter((p) => p.area === area);
  }

  /** Get all ready plugins */
  getReadyPlugins(): MarketPlugin[] {
    return Array.from(this.plugins.values()).filter((p) => p.status === 'ready');
  }

  /** List all registered plugin IDs */
  listPluginIds(): string[] {
    return Array.from(this.plugins.keys());
  }

  /** Get status of all plugins */
  getStatus(): Record<string, PluginStatus> {
    const status: Record<string, PluginStatus> = {};
    this.plugins.forEach((plugin, id) => {
      status[id] = plugin.status;
    });
    return status;
  }

  /** Health check all plugins */
  async healthCheckAll(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    for (const [id, plugin] of Array.from(this.plugins)) {
      try {
        results[id] = await plugin.healthCheck();
      } catch {
        results[id] = false;
      }
    }
    return results;
  }

  /** Shut down all plugins */
  async shutdownAll(): Promise<void> {
    const promises = Array.from(this.plugins.values()).map((p) => p.shutdown());
    await Promise.allSettled(promises);
    this.plugins.clear();
  }
}

/** Singleton instance */
export const pluginRegistry = new PluginRegistry();
