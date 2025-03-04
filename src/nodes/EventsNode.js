const merge = require('lodash.merge');

const BaseError = require('../common/errors/BaseError').default;
const BaseNode = require('./BaseNode');
const {
    INTEGRATION_EVENT,
    INTEGRATION_LOADED,
    INTEGRATION_UNLOADED,
    INTEGRATION_NOT_LOADED,
} = require('../const');

const DEFAULT_NODE_OPTIONS = {
    debug: false,
    config: {
        exposeToHomeAssistant: (nodeDef) =>
            nodeDef.exposeToHomeAssistant === undefined
                ? false
                : nodeDef.exposeToHomeAssistant,
    },
};

class EventsNode extends BaseNode {
    constructor({ node, config, RED, status, nodeOptions = {} }) {
        nodeOptions = merge({}, DEFAULT_NODE_OPTIONS, nodeOptions);
        super({ node, config, RED, status, nodeOptions });
        this.listeners = {};
        this.registered = false;
        this.integrationErrorMessage =
            'Node-RED custom integration needs to be installed in Home Assistant for this node to function correctly.';
        this.status = status;
        this.status.init({
            nodeState: this.isEnabled,
            homeAssistant: this.homeAssistant,
        });

        // Setup event listeners
        const events = {
            'ha_client:close': this.onHaEventsClose,
            'ha_client:error': this.onHaEventsError,
            [INTEGRATION_EVENT]: this.onHaIntegration,
        };
        Object.entries(events).forEach(([event, callback]) =>
            this.addEventClientListener(event, callback.bind(this))
        );
    }

    errorHanlderForEvents(callback) {
        return (...args) => {
            try {
                // eslint-disable-next-line n/no-callback-literal
                callback(...args);
            } catch (err) {
                if (err instanceof BaseError) {
                    this.status.setFailed(err.statusMessage);
                    this.node.error(err);
                } else {
                    this.status.setFailed(
                        this.RED._('home-assistant.status.error')
                    );
                    this.node.error(err.message);
                }
            }
        };
    }

    addEventClientListener(event, handler) {
        if (this.homeAssistant) {
            const callback = this.errorHanlderForEvents(handler);
            this.listeners[event] = callback;
            this.homeAssistant.addListener(event, callback);
        }
    }

    removeEventClientListeners() {
        if (this.homeAssistant) {
            Object.entries(this.listeners).forEach(([event, handler]) => {
                this.homeAssistant.removeListener(event, handler);
            });
        }
    }

    async onClose(removed) {
        super.onClose(removed);
        this.removeEventClientListeners();
        if (typeof this.status.destroy === 'function') {
            this.status.destroy();
        }
    }

    onHaEventsClose() {
        this.registered = false;
    }

    onHaEventsError(err) {
        if (err && err.message) this.node.error(err.message);
    }

    onHaIntegration(type) {
        switch (type) {
            case INTEGRATION_LOADED:
                this.registerEntity();
                break;
            case INTEGRATION_UNLOADED:
            case INTEGRATION_NOT_LOADED:
                this.registered = false;
                break;
        }
    }

    registerEntity() {
        if (this.nodeConfig.exposeToHomeAssistant === false) {
            return false;
        }

        if (!this.isIntegrationLoaded) {
            if (
                this.node.type === 'ha-webhook' ||
                this.node.type === 'ha-entity'
            ) {
                this.node.error(this.integrationErrorMessage);
                this.status.setFailed('Error');
            }
            return false;
        }

        if (this.registered) {
            return false;
        }
    }
}

module.exports = EventsNode;
