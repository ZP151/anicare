/** Synthetic records only. Coordinates represent test areas, not real cat sightings. */
export const samples = [
 ['ios26-s01','00000000-0000-4000-8000-00000000a101','阿橘','orange.jpg','896520ca163ffff'],
 ['ios26-s02','00000000-0000-4000-8000-00000000a102','小白','white.jpg','896520ca163ffff'],
 ['ios26-s03','00000000-0000-4000-8000-00000000a103','狸花','tabby.jpg','89652636d87ffff'],
 ['ios26-s04','00000000-0000-4000-8000-00000000a104','小墨','tuxedo.jpg','896526add03ffff'],
 ['ios26-s05','00000000-0000-4000-8000-00000000a105','无图样本',null,'896526add03ffff'],
 ['ios26-s06','00000000-0000-4000-8000-00000000a106','旧活动样本',null,'89652636d87ffff'],
 ['ios26-s07','00000000-0000-4000-8000-00000000a107','Mochi 麻糬','white.jpg','896526349cbffff'],
 ['ios26-s08','00000000-0000-4000-8000-00000000a108','Oliver 奥利','orange.jpg','89652634107ffff'],
 ['ios26-s09','00000000-0000-4000-8000-00000000a109','Luna 露娜','tabby.jpg','896526362cbffff'],
 ['ios26-s10','00000000-0000-4000-8000-00000000a110','Pepper 胡椒','tuxedo.jpg','89652636287ffff'],
 ['ios26-s11','00000000-0000-4000-8000-00000000a111','Sunny 小阳','orange.jpg','896520d9073ffff'],
 ['ios26-s12','00000000-0000-4000-8000-00000000a112','Coco 可可','tabby.jpg','896520d83c3ffff'],
 ['ios26-s13','00000000-0000-4000-8000-00000000a113','Snowy 小雪','white.jpg','896526acebbffff'],
 ['ios26-s14','00000000-0000-4000-8000-00000000a114','Midnight 午夜','tuxedo.jpg','896526ad803ffff'],
 ['ios26-s15','00000000-0000-4000-8000-00000000a115','Biscuit 饼干',null,'896520cb1cfffff'],
 ['ios26-s16','00000000-0000-4000-8000-00000000a116','Willow 柳柳',null,'896520ca673ffff'],
] as const;
export const legacyEnglishNames=['Marmalade','Cloud','Tiger','Oreo','Echo','Amber'];
export const samplePlaces:Readonly<Record<string,{residenceType:'hdb'|'condo'|'other';name:string}>>={
 'ios26-s01':{residenceType:'hdb',name:'Demo HDB · Jurong West'},
 'ios26-s02':{residenceType:'condo',name:'Demo Condo · Jurong West'},
 'ios26-s07':{residenceType:'hdb',name:'Demo HDB Block A · Woodlands'},
 'ios26-s08':{residenceType:'condo',name:'Demo Condo · Yishun'},
 'ios26-s09':{residenceType:'hdb',name:'Demo HDB Block B · Punggol'},
 'ios26-s10':{residenceType:'condo',name:'Demo Condo · Sengkang'},
 'ios26-s11':{residenceType:'hdb',name:'Demo HDB Block C · Toa Payoh'},
 'ios26-s12':{residenceType:'condo',name:'Demo Condo · Queenstown'},
 'ios26-s13':{residenceType:'hdb',name:'Demo HDB Block D · Bedok'},
 'ios26-s14':{residenceType:'other',name:'Demo park · Pasir Ris'},
 'ios26-s15':{residenceType:'hdb',name:'Demo HDB Block E · Choa Chu Kang'},
 'ios26-s16':{residenceType:'condo',name:'Demo Condo · Bukit Batok'},
};
