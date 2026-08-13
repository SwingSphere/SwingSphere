
export interface Settings {
    notifications: {
        newSubmissionAlerts: boolean;
        flaggedContentAlerts: boolean;
        alertEmail: string;
    };
    templates: {
        submissionSuccessMessage: string;
        eventInstructionText: string;
        footerLegalDisclaimer: string;
    };
    platformConfig: {
        requireManualApproval: boolean;
        maxTagsPerListing: number;
        showDeprecatedTags: boolean;
    };
    featureToggles: {
        enableBadges: boolean;
        enableGlobeGeoSync: boolean;
    };
    apiKeys: {
        googleMaps: string;
    };
}

export const mockSettings: Settings = {
    notifications: {
        newSubmissionAlerts: true,
        flaggedContentAlerts: true,
        alertEmail: 'admin@swingsphere.co',
    },
    templates: {
        submissionSuccessMessage: 'Thank you! Your submission has been received and is pending review by our moderation team.',
        eventInstructionText: 'Please bring a valid, government-issued ID. All guests must adhere to the house rules.',
        footerLegalDisclaimer: 'SwingSphere is an informational directory. We do not host, operate, or endorse any listed events or clubs. Your attendance is at your own risk.',
    },
    platformConfig: {
        requireManualApproval: true,
        maxTagsPerListing: 10,
        showDeprecatedTags: false,
    },
    featureToggles: {
        enableBadges: true,
        enableGlobeGeoSync: false,
    },
    apiKeys: {
        googleMaps: 'YOUR_GOOGLE_MAPS_API_KEY_HERE',
    },
};
