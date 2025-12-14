import globalOptions from '../../global-options.json' with { type: 'json' };

export const getGlobalOptions = () => {
    return { ...globalOptions };
};
