import type { Namecard } from './namecard';

export type Person = {
    id: number;
    name: string;

    namecards: Array<Namecard>;
};