#!/bin/bash

echo "=========================================="
echo "  MONITORAMENTO LOGCAT - POWER DIALER"
echo "=========================================="
echo ""
echo "Limpando logcat anterior..."
adb logcat -c
echo ""
echo "✅ Logcat limpo!"
echo ""
echo "Iniciando monitoramento... (Ctrl+C para parar)"
echo ""
echo "=========================================="
echo ""

adb logcat -v time | grep --line-buffered -E "(PowerDialerManager|MobileApp|PbxMobilePlugin|📞|📊|✅|❌|🔗|🤝|🔍|⚠️|📵|🔓|📴|⏳|🚨|CRÍTICO|conference|conferência|merge|Merge|CAPABILITY|stopCampaign|stop_campaign|Campanha|campaign|pool maintenance|ACTIVE|HOLDING|DIALING|RINGING|DISCONNECTED|FAILED|Comando recebido|handleCommand|Campanha foi encerrada|Campanha encerrada)"

