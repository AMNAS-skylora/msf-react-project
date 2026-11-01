import source from './members.json';

export const GROUPS = [
  { id: 'leadership', title: 'Core Leadership', malayalam: 'പ്രധാന നേതൃത്വം', order: 1 },
  { id: 'vice', title: 'Vice Presidents', malayalam: 'വൈസ് പ്രസിഡന്റുമാർ', order: 2 },
  { id: 'joint', title: 'Joint Secretaries', malayalam: 'ജോയിന്റ് സെക്രട്ടറിമാർ', order: 3 },
  { id: 'executive', title: 'Executive Members', malayalam: 'എക്സിക്യൂട്ടീവ് അംഗങ്ങൾ', order: 4 },
];

export const MEMBERS = source.map((item) => ({
  ...item,
  id: item.image.split('/').pop().replace(/\.webp$/i, ''),
}));

export const imageUrl = (member) => import.meta.env.BASE_URL + member.image;
