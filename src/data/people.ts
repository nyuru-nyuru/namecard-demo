import type { Person } from '../model/person'

const histories = [
  {
    id: 1,
    name: 'Mara Venn',
    namecards: [
      { id: 101, company: 'Lantern Byte Games', role: '6502 Game Programmer', year: 1982 },
      { id: 102, company: 'Bramble Circuit Studios', role: 'Lead Game Programmer', year: 1988 },
      { id: 103, company: 'Copper Finch Interactive', role: 'Technical Director', year: 1996 },
    ],
  },
  {
    id: 2,
    name: 'Jonas Bellwick',
    namecards: [
      { id: 201, company: 'Lantern Byte Games', role: 'Game Designer', year: 1982 },
      { id: 202, company: 'Lantern Byte Games', role: 'Senior Game Designer', year: 1986 },
      { id: 203, company: 'Bramble Circuit Studios', role: 'Lead Game Designer', year: 1990 },
      { id: 204, company: 'Bramble Circuit Studios', role: 'Creative Director', year: 1995 },
      { id: 205, company: 'Compass Lantern Games', role: 'Studio Director', year: 2000 },
      { id: 206, company: 'Morrow Kite Games', role: 'Co-founder and Creative Director', year: 2007 },
      { id: 207, company: 'Bellwick Playcraft', role: 'Independent Game Design Consultant', year: 2015 },
    ],
  },
  {
    id: 3,
    name: 'Leila Arden',
    namecards: [
      { id: 301, company: 'Lantern Byte Games', role: 'Pixel Artist', year: 1983 },
      { id: 302, company: 'Bramble Circuit Studios', role: 'Lead Pixel Artist', year: 1990 },
    ],
  },
  {
    id: 4,
    name: 'Tomas Reedwell',
    namecards: [
      { id: 401, company: 'Lantern Byte Games', role: 'Game Music Composer', year: 1983 },
      { id: 402, company: 'Blue Comet Audio', role: 'Audio Director', year: 1991 },
    ],
  },
  {
    id: 5,
    name: 'Nia Calder',
    namecards: [
      { id: 501, company: 'Lantern Byte Games', role: 'Game Tester', year: 1984 },
      { id: 502, company: 'Lantern Byte Games', role: 'QA Lead', year: 1988 },
      { id: 503, company: 'Bramble Circuit Studios', role: 'QA Manager', year: 1994 },
    ],
  },
  {
    id: 6,
    name: 'Elias Fenwick',
    namecards: [
      { id: 601, company: 'Meadowline Electronics', role: 'Electronics Technician', year: 1985 },
    ],
  },
  {
    id: 7,
    name: 'Priya Solmere',
    namecards: [
      { id: 701, company: 'Paper Lantern Press', role: 'Print Designer', year: 1986 },
      { id: 702, company: 'Paper Lantern Press', role: 'Senior Print Designer', year: 1991 },
      { id: 703, company: 'Copper Finch Interactive', role: 'Graphic Designer', year: 1996 },
      { id: 704, company: 'Copper Finch Interactive', role: 'UI Designer', year: 2002 },
      { id: 705, company: 'Morrow Kite Games', role: 'Lead UI Designer', year: 2008 },
      { id: 706, company: 'Morrow Kite Games', role: 'UX Director', year: 2014 },
      { id: 707, company: 'Solmere Design Office', role: 'Independent UX Consultant', year: 2021 },
    ],
  },
  {
    id: 8,
    name: 'Owen Ashcroft',
    namecards: [
      { id: 801, company: 'Stonebridge Office Supply', role: 'Accounts Assistant', year: 1987 },
      { id: 802, company: 'Bramble Circuit Studios', role: 'Finance Manager', year: 1995 },
    ],
  },
]

export const people: Person[] = histories.map((person) => ({
  ...person,
  namecards: person.namecards.map((card) => ({
    ...card,
    personId: person.id,
    personDisplayName: person.name,
    backText: '',
    backViewed: false,
  })),
}))
