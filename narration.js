/* Văn mẫu lời dẫn. Mỗi khoá có thể có nhiều câu, máy chọn ngẫu nhiên cho đỡ nhàm.
   Lời dẫn được đọc to nên KHÔNG BAO GIỜ chứa thông tin bí mật (ai bị cắn, ai là Sói…):
   những thứ đó chỉ hiện trên màn hình cho đúng người đang mở mắt. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NARR = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STYLES = {
    classic: { name: 'Cổ điển', desc: 'Ngắn gọn, rõ ràng' },
    drama: { name: 'Kịch tính', desc: 'Huyền bí, rùng rợn' },
    fun: { name: 'Hài hước', desc: 'Lầy lội, vui vẻ' },
  };

  const LINES = {
    classic: {
      nightStart1: ['Màn đêm buông xuống. Cả làng hãy nhắm mắt lại.'],
      nightStart: ['Đêm thứ {n} bắt đầu. Cả làng, hãy nhắm mắt.'],
      cupid_wake: ['Thần tình yêu, hãy mở mắt. Hãy cầm máy và chọn hai người sẽ yêu nhau.'],
      cupid_sleep: ['Thần tình yêu, hãy nhẹ nhàng chạm vào vai hai người được chọn, rồi nhắm mắt lại.'],
      lovers_wake: ['Hai người vừa được chạm vai, hãy mở mắt và nhìn vào máy để biết người yêu của mình.'],
      lovers_sleep: ['Hai người yêu, hãy nhắm mắt lại.'],
      guard_wake: ['Bảo vệ, hãy mở mắt. Đêm nay bạn muốn bảo vệ ai?'],
      guard_sleep: ['Bảo vệ, hãy nhắm mắt.'],
      wolves_wake1: ['Sói, hãy mở mắt và nhận mặt đồng bọn. Hãy thống nhất chọn một người để cắn.'],
      wolves_wake: ['Sói, hãy mở mắt. Đêm nay các bạn muốn cắn ai?'],
      wolves_sleep: ['Sói, hãy nhắm mắt.'],
      witch_wake: ['Phù thủy, hãy mở mắt. Hãy xem máy và quyết định có dùng bình thuốc hay không.'],
      witch_sleep: ['Phù thủy, hãy nhắm mắt.'],
      seer_wake: ['Tiên tri, hãy mở mắt. Hãy chọn một người để soi.'],
      seer_sleep: ['Tiên tri, hãy nhắm mắt.'],
      dawn: ['Trời sáng rồi. Cả làng hãy mở mắt.'],
      deaths: ['Đêm qua, {names} đã chết.'],
      peaceful: ['Đêm qua là một đêm bình yên, không ai chết cả.'],
      reveal: ['{name} là {role}.'],
      love: ['{name} quá đau buồn và đã chết theo người yêu.'],
      hunter: ['{name} là Thợ săn. Thợ săn, hãy chọn một người để bắn.'],
      shot: ['{name} đã trúng tên của Thợ săn.'],
      noshot: ['Thợ săn đã hạ cung, không bắn ai.'],
      discuss: ['Cả làng có {time} để thảo luận và tìm ra Sói.'],
      timeup: ['Hết giờ thảo luận.'],
      vote: ['Cả làng hãy bỏ phiếu chọn người bị treo cổ.'],
      lynch: ['{name} đã bị cả làng treo cổ.'],
      nolynch: ['Hôm nay cả làng không treo cổ ai.'],
      win_village: ['Tất cả Sói đã bị tiêu diệt. Dân làng chiến thắng!'],
      win_wolf: ['Sói đã áp đảo ngôi làng. Phe Sói chiến thắng!'],
      win_lovers: ['Chỉ còn lại đôi tình nhân. Tình yêu chiến thắng!'],
      win_none: ['Không còn ai sống sót. Không ai chiến thắng.'],
    },
    drama: {
      nightStart1: ['Đêm đầu tiên. Trăng tròn treo trên ngọn núi, gió lạnh thổi qua ngôi làng nhỏ. Cả làng, hãy nhắm mắt lại.'],
      nightStart: [
        'Đêm thứ {n}. Bóng tối lại phủ xuống ngôi làng. Cả làng, hãy nhắm mắt.',
        'Đêm thứ {n} buông xuống, tiếng sói tru vọng lại từ rừng sâu. Cả làng, hãy nhắm mắt.',
      ],
      cupid_wake: ['Thần tình yêu, hãy thức dậy. Hãy chọn hai trái tim sẽ gắn chặt vận mệnh với nhau.'],
      cupid_sleep: ['Thần tình yêu, hãy chạm nhẹ vào vai hai kẻ được chọn, rồi chìm vào giấc ngủ.'],
      lovers_wake: ['Hai kẻ vừa được chạm vai, hãy mở mắt. Hãy nhìn vào máy, người ấy chính là định mệnh của bạn.'],
      lovers_sleep: ['Từ đêm nay, sống cùng sống, chết cùng chết. Hai người yêu, hãy nhắm mắt lại.'],
      guard_wake: ['Bảo vệ, hãy thức dậy. Tấm khiên của bạn sẽ che chở cho ai đêm nay?'],
      guard_sleep: ['Bảo vệ, hãy nhắm mắt và cầu mong tấm khiên đủ vững.'],
      wolves_wake1: ['Bầy Sói, hãy thức dậy và nhận mặt nhau. Hãy cùng chọn con mồi đầu tiên.'],
      wolves_wake: [
        'Bầy Sói, hãy thức dậy. Cơn đói lại cồn cào, đêm nay ai sẽ là con mồi?',
        'Bầy Sói, hãy mở mắt. Hãy chọn con mồi của đêm nay.',
      ],
      wolves_sleep: ['Bầy Sói, hãy nhắm mắt lại, và giấu kín nanh vuốt.'],
      witch_wake: ['Phù thủy, hãy thức dậy. Bình cứu, bình độc, số phận đêm nay nằm trong tay bạn.'],
      witch_sleep: ['Phù thủy, hãy nhắm mắt và cất bình thuốc đi.'],
      seer_wake: ['Tiên tri, hãy thức dậy. Quả cầu pha lê đang chờ, hãy chọn người bạn muốn nhìn thấu.'],
      seer_sleep: ['Tiên tri, hãy nhắm mắt và giữ kín điều bạn vừa thấy.'],
      dawn: ['Gà gáy, bình minh ló dạng. Cả làng hãy thức dậy.'],
      deaths: ['Đêm qua có tiếng thét trong bóng tối. {names} đã không bao giờ tỉnh dậy nữa.'],
      peaceful: ['Đêm qua yên lặng đến lạ thường. Không ai chết cả.'],
      reveal: ['{name} là {role}.'],
      love: ['Không chịu nổi nỗi đau mất người yêu, {name} đã đi theo người ấy.'],
      hunter: ['{name} là Thợ săn. Trước khi gục ngã, Thợ săn hãy chọn người sẽ cùng đi theo mình.'],
      shot: ['Mũi tên cuối cùng đã cắm vào tim {name}.'],
      noshot: ['Thợ săn buông cung, lặng lẽ ra đi một mình.'],
      discuss: ['Sói đang ở ngay giữa các bạn. Cả làng có {time} để vạch mặt chúng.'],
      timeup: ['Thời gian đã hết.'],
      vote: ['Đã đến lúc phán xét. Cả làng hãy chọn kẻ phải lên giá treo cổ.'],
      lynch: ['Dây thừng siết lại. {name} đã bị cả làng treo cổ.'],
      nolynch: ['Cả làng do dự, hôm nay không ai bị treo cổ.'],
      win_village: ['Con Sói cuối cùng đã gục ngã. Ánh sáng trở lại ngôi làng. Dân làng chiến thắng!'],
      win_wolf: ['Tiếng tru vang khắp ngôi làng hoang tàn. Phe Sói chiến thắng!'],
      win_lovers: ['Giữa đống tro tàn chỉ còn lại đôi tình nhân. Tình yêu chiến thắng tất cả!'],
      win_none: ['Ngôi làng chìm trong im lặng, không còn ai sống sót.'],
    },
    fun: {
      nightStart1: ['Tối rồi cả làng ơi! Nhắm mắt lại nào, cấm ti hí đó nha.'],
      nightStart: ['Đêm thứ {n} tới rồi. Cả làng nhắm mắt, đứa nào hé mắt là bị nghi đầu tiên đó.'],
      cupid_wake: ['Thần tình yêu dậy đi. Chọn hai người để se duyên nào, chọn khéo kẻo thành bi kịch.'],
      cupid_sleep: ['Thần tình yêu chạm nhẹ vai hai người được chọn nha, nhẹ thôi, xong rồi đi ngủ.'],
      lovers_wake: ['Hai người vừa bị chạm vai, mở mắt ra nhìn máy coi. Chúc mừng, có bồ rồi đó!'],
      lovers_sleep: ['Ngắm nhau đủ rồi, hai bạn trẻ nhắm mắt lại đi.'],
      guard_wake: ['Bảo vệ ơi dậy đi ca. Đêm nay đứng gác cửa nhà ai đây?'],
      guard_sleep: ['Bảo vệ nhắm mắt, nhớ đừng ngủ gật nha.'],
      wolves_wake1: ['Các bé Sói dậy đi, nhận mặt nhau cái nào. Rồi chọn món đầu tiên trong thực đơn.'],
      wolves_wake: ['Sói ơi dậy đi, tới giờ ăn khuya rồi. Đêm nay ăn ai đây?'],
      wolves_sleep: ['Sói chùi mép rồi nhắm mắt lại đi.'],
      witch_wake: ['Phù thủy dậy đi, mở tủ thuốc ra coi nào. Cứu hay đầu độc, tùy tâm trạng.'],
      witch_sleep: ['Phù thủy cất thuốc, nhắm mắt đi ngủ.'],
      seer_wake: ['Tiên tri dậy đi. Muốn soi ai thì soi, nhớ soi cho chuẩn.'],
      seer_sleep: ['Tiên tri nhắm mắt, nhớ giữ bí mật nha, đừng có lộ bài.'],
      dawn: ['Ò ó o! Sáng rồi, cả làng dậy đi nào.'],
      deaths: ['Tin buồn: đêm qua {names} đã lên đường. Xin chia buồn.'],
      peaceful: ['Đêm qua không ai chết. Sói nhịn đói rồi, tội nghiệp ghê.'],
      reveal: ['Lật bài: {name} là {role}.'],
      love: ['{name} buồn quá không thiết sống nữa, đi theo người yêu luôn rồi.'],
      hunter: ['Ối, {name} là Thợ săn! Thợ săn ơi, chọn một người để kéo theo đi.'],
      shot: ['Phập! {name} lãnh trọn mũi tên.'],
      noshot: ['Thợ săn hiền quá, không bắn ai.'],
      discuss: ['Cả làng có {time} để cãi nhau. Ai nói nhiều là đáng nghi đó.'],
      timeup: ['Hết giờ, thôi cãi nhau đi.'],
      vote: ['Giờ bỏ phiếu! Chỉ tay vào người đáng nghi nhất nào.'],
      lynch: ['{name} đã bị cả làng cho lên đường.'],
      nolynch: ['Cả làng hiền quá, hôm nay tha cho tất cả.'],
      win_village: ['Hết Sói rồi! Dân làng chiến thắng, mở tiệc thôi!'],
      win_wolf: ['Sói ăn no nê rồi. Phe Sói chiến thắng!'],
      win_lovers: ['Cả làng đi hết, còn lại đôi uyên ương. Tình yêu chiến thắng!'],
      win_none: ['Không còn ai luôn. Ván này hòa trong nước mắt.'],
    },
  };

  function line(style, key, vars) {
    const set = (LINES[style] && LINES[style][key]) || LINES.classic[key];
    if (!set) return '';
    const text = set[Math.floor(Math.random() * set.length)];
    return text.replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? vars[k] : ''));
  }

  function joinNames(names) {
    if (names.length <= 1) return names.join('');
    return names.slice(0, -1).join(', ') + ' và ' + names[names.length - 1];
  }

  function spokenTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (!m) return `${s} giây`;
    return s ? `${m} phút ${s} giây` : `${m} phút`;
  }

  return { STYLES, LINES, line, joinNames, spokenTime };
});
